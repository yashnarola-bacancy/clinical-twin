import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateNote } from "@/lib/ai/claude";
import { Disposition, CodeSystem, EncounterStatus, NoteStatus, Prisma } from "@prisma/client";

type SavedNote = Prisma.ClinicalNoteGetPayload<{ include: { codes: true } }>;

const RequestSchema = z.object({
  encounterId: z.string().min(1, "encounterId is required"),
  transcript:  z.string().min(1, "transcript is required"),
});

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

// Map SOAP note disposition → Prisma Disposition enum
const DISP_MAP: Partial<Record<string, Disposition>> = {
  "discharge-home":    Disposition.DISCHARGE,
  "admit-observation": Disposition.ADMIT_WARD,
  "admit-inpatient":   Disposition.ADMIT_WARD,
  "transfer":          Disposition.REFERRAL,
  "left-ama":          Disposition.DISCHARGE,
  // "expired" has no clean DB mapping — left null
};

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<SavedNote>>> {
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

  const { encounterId, transcript } = validation.data;

  // ── Verify encounter ──────────────────────────────────────────────
  let encounter: { id: string } | null;
  try {
    encounter = await db.encounter.findUnique({
      where: { id: encounterId },
      select: { id: true },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }

  if (!encounter) {
    return NextResponse.json({ ok: false, error: "Encounter not found" }, { status: 404 });
  }

  // ── Generate SOAP note ────────────────────────────────────────────
  let result: Awaited<ReturnType<typeof generateNote>>;
  try {
    result = await generateNote(transcript);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Note generation failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  const { note, latencyMs } = result;

  // ── Persist in a transaction, return the saved note ─────────────
  let savedNote: SavedNote;
  try {
    savedNote = await db.$transaction(async (tx) => {
      // Upsert ClinicalNote — reset to DRAFT on re-generation
      const upserted = await tx.clinicalNote.upsert({
        where: { encounterId },
        create: {
          encounterId,
          subjective:   note.subjective,
          objective:    note.objective,
          assessment:   note.assessment,
          plan:         note.plan,
          aiModel:      "claude-sonnet-4-6",
          generationMs: latencyMs,
        },
        update: {
          subjective:   note.subjective,
          objective:    note.objective,
          assessment:   note.assessment,
          plan:         note.plan,
          aiModel:      "claude-sonnet-4-6",
          generationMs: latencyMs,
          status:       NoteStatus.DRAFT,
          editedFields: [],
          signedById:   null,
          signedAt:     null,
        },
      });

      // Replace code suggestions
      await tx.codeSuggestion.deleteMany({ where: { noteId: upserted.id } });
      if (note.codes.length > 0) {
        await tx.codeSuggestion.createMany({
          data: note.codes.map((c) => ({
            noteId:      upserted.id,
            system:      c.system as CodeSystem,
            code:        c.code,
            description: c.description,
            confidence:  c.confidence,
          })),
        });
      }

      // Update encounter: move to AWAITING_REVIEW, persist AI metadata
      await tx.encounter.update({
        where: { id: encounterId },
        data: {
          status:                EncounterStatus.AWAITING_REVIEW,
          predictedDisposition:  DISP_MAP[note.predictedDisposition] ?? null,
          dispositionConfidence: note.dispositionConfidence,
          orderedLabs:           note.orderedLabs,
          orderedImaging:        note.orderedImaging,
        },
      });

      // Return the full note with codes so the response includes everything
      return tx.clinicalNote.findUniqueOrThrow({
        where:   { id: upserted.id },
        include: { codes: { orderBy: { confidence: "desc" } } },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save note";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }

  return NextResponse.json({ ok: true, data: savedNote });
}
