import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../../../../auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { runSimulation } from "@/lib/simulation/engine";
import { generatePatients, type PatientCalibration } from "@/lib/simulation/generatePatients";
import type { SimConfig, SimResults } from "@/lib/simulation/types";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

// Cap the exam-duration pool so a huge history doesn't bloat the in-memory draw.
const MAX_EXAM_SAMPLES = 2000;
// Drop clock-skew / data-entry garbage when measuring exam durations (minutes).
const MIN_EXAM_MIN = 1;
const MAX_EXAM_MIN = 240;

const ADMIT_DISPOSITIONS = new Set(["ADMIT_WARD", "ADMIT_ICU"]);

// ── Request: a SimConfig, plus optional run controls ────────────────────────
const ConfigSchema = z.object({
  edNurses:           z.number().int().min(0).max(10_000),
  outpatientNurses:   z.number().int().min(0).max(10_000),
  doctors:            z.number().int().min(0).max(10_000),
  beds:               z.number().int().min(1).max(10_000),
  arrivalRatePerHour: z.number().positive().max(1_000),
  simDurationHours:   z.number().positive().max(168), // ≤ 1 week
});

const RequestSchema = ConfigSchema.extend({
  // Same seed → reproducible run. Defaults to a fixed value for determinism.
  seed:       z.number().int().optional(),
  // Persist the run as a SimulationRun row.
  save:       z.boolean().optional(),
  name:       z.string().min(1).max(200).optional(),
  baselineId: z.string().min(1).optional(),
});

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<SimResults>>> {
  // ── Require an authenticated user ─────────────────────────────────
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON body" }, { status: 400 });
  }

  const v = RequestSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { ok: false, error: v.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const { seed = 42, save = false, name, baselineId, ...config } = v.data;
  const simConfig: SimConfig = config;

  // ── Calibrate from real signed-encounter timing data ──────────────────────
  // Best-effort: if the DB is unreachable we fall back to the synthetic model
  // so the simulator still works, rather than failing the whole request.
  let calibration: PatientCalibration | undefined;
  try {
    calibration = await deriveCalibration();
  } catch {
    calibration = undefined;
  }

  // ── Generate patients + run the (pure) simulation ─────────────────────────
  const patients = generatePatients(simConfig, seed, calibration);
  const results = runSimulation(simConfig, patients);

  // ── Optionally persist the run ────────────────────────────────────────────
  if (save) {
    try {
      await db.simulationRun.create({
        data: {
          name: name ?? defaultRunName(simConfig),
          config: simConfig as unknown as Prisma.InputJsonValue,
          results: results as unknown as Prisma.InputJsonValue,
          baselineId: baselineId ?? null,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save simulation run";
      return NextResponse.json({ ok: false, error: msg }, { status: 503 });
    }
  }

  return NextResponse.json({ ok: true, data: results });
}

// ─────────────────────────────────────────────────────────────────────────────
// Calibration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull exam durations and admission outcomes from signed encounters and reduce
 * them to a {@link PatientCalibration}. Returns `undefined` when there isn't
 * enough signal to calibrate (e.g. a fresh/empty database), so the generator
 * uses its built-in synthetic defaults.
 *
 * Note: we also compute admission rates per department for transparency, but
 * blend them into a single volume-weighted rate — the patient generator is not
 * yet department-aware, so a per-department split has nowhere to attach.
 */
async function deriveCalibration(): Promise<PatientCalibration | undefined> {
  const encounters = await db.encounter.findMany({
    where: {
      signedAt: { not: null }, // signed (and the later SYNCED) encounters
      examStartAt: { not: null },
      examEndAt: { not: null },
    },
    select: {
      department: true,
      examStartAt: true,
      examEndAt: true,
      predictedDisposition: true,
    },
  });

  if (encounters.length === 0) return undefined;

  const examDurationsMin: number[] = [];
  // department -> { total, admitted }
  const byDept = new Map<string, { total: number; admitted: number }>();

  for (const e of encounters) {
    if (e.examStartAt && e.examEndAt) {
      const minutes = (e.examEndAt.getTime() - e.examStartAt.getTime()) / 60_000;
      if (minutes >= MIN_EXAM_MIN && minutes <= MAX_EXAM_MIN) {
        examDurationsMin.push(minutes);
      }
    }

    const dept = byDept.get(e.department) ?? { total: 0, admitted: 0 };
    dept.total += 1;
    if (e.predictedDisposition && ADMIT_DISPOSITIONS.has(e.predictedDisposition)) {
      dept.admitted += 1;
    }
    byDept.set(e.department, dept);
  }

  // Volume-weighted overall admission rate (sum of admits / sum of encounters).
  let totalAdmitted = 0;
  let totalSeen = 0;
  for (const { total, admitted } of byDept.values()) {
    totalSeen += total;
    totalAdmitted += admitted;
  }
  const admitRate = totalSeen > 0 ? totalAdmitted / totalSeen : undefined;

  // Nothing usable measured → no calibration.
  if (examDurationsMin.length === 0 && admitRate === undefined) return undefined;

  return {
    examDurationsMin:
      examDurationsMin.length > MAX_EXAM_SAMPLES
        ? examDurationsMin.slice(0, MAX_EXAM_SAMPLES)
        : examDurationsMin,
    admitRate,
  };
}

function defaultRunName(c: SimConfig): string {
  const nurses = c.edNurses + c.outpatientNurses;
  return `Run · ${nurses}N/${c.doctors}D/${c.beds}B @ ${c.arrivalRatePerHour}/hr · ${c.simDurationHours}h`;
}
