import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../../../../auth";
import { db } from "@/lib/db";
import { EncounterStatus, NoteStatus, Prisma } from "@prisma/client";
import { buildFhirBundle, type FhirBundle } from "@/lib/fhir/bundle";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

type SyncData = {
  latencyMs: number;
  bundle: FhirBundle;
};

const RequestSchema = z.object({
  encounterId: z.string().min(1, "encounterId is required"),
});

/** Simulate a network round-trip to the (mock) EHR. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<SyncData>>> {
  // ── Require an authenticated user ─────────────────────────────────
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON body" }, { status: 400 });
  }

  const validation = RequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { ok: false, error: validation.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const { encounterId } = validation.data;

  // ── Load encounter + patient + note + accepted codes ──────────────
  let encounter: Prisma.EncounterGetPayload<{
    include: {
      patient: true;
      note: { include: { codes: true } };
    };
  }> | null;
  try {
    encounter = await db.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patient: true,
        note: {
          include: {
            codes: { where: { accepted: true }, orderBy: { confidence: "desc" } },
          },
        },
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }

  if (!encounter) {
    return NextResponse.json({ ok: false, error: "Encounter not found" }, { status: 404 });
  }

  const note = encounter.note;
  if (!note) {
    return NextResponse.json(
      { ok: false, error: "Encounter has no clinical note to sync" },
      { status: 409 }
    );
  }

  // ── Guard: only SIGNED notes may sync to the EHR ──────────────────
  if (note.status !== NoteStatus.SIGNED) {
    return NextResponse.json(
      {
        ok: false,
        error: `Cannot sync: note must be SIGNED before EHR sync (current status: ${note.status})`,
      },
      { status: 409 }
    );
  }

  // ── Build the FHIR bundle (pure) ──────────────────────────────────
  const bundle = buildFhirBundle(encounter, note, note.codes);

  // ── Simulate the network sync and measure elapsed time ────────────
  const delayMs = 200 + Math.floor(Math.random() * 1301); // 200–1500 ms
  const startedAt = Date.now();
  await sleep(delayMs);
  const latencyMs = Date.now() - startedAt;

  // ── Persist sync log + flip encounter to SYNCED ───────────────────
  try {
    await db.$transaction(async (tx) => {
      await tx.ehrSyncLog.create({
        data: {
          encounterId,
          fhirBundle: bundle as unknown as Prisma.InputJsonValue,
          latencyMs,
          success: true,
        },
      });

      await tx.encounter.update({
        where: { id: encounterId },
        data: { status: EncounterStatus.SYNCED, syncedAt: new Date() },
      });
    }, { maxWait: 10_000, timeout: 20_000 }); // generous: remote/serverless DB can be slow to wake
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record EHR sync";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }

  return NextResponse.json({ ok: true, data: { latencyMs, bundle } });
}
