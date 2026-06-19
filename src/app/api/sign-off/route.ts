import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../../../../auth";
import { db } from "@/lib/db";
import { NoteStatus, EncounterStatus, Prisma } from "@prisma/client";

type SavedNote = Prisma.ClinicalNoteGetPayload<{ include: { codes: true } }>;
type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

const RequestSchema = z.object({
  noteId:          z.string().min(1),
  encounterId:     z.string().min(1),
  fields: z.object({
    subjective: z.string(),
    objective:  z.string(),
    assessment: z.string(),
    plan:       z.string(),
  }),
  editedFields:    z.array(z.string()),
  acceptedCodeIds: z.array(z.string()),
});

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<SavedNote>>> {
  // ── Require an authenticated user; they become the signer ─────────
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

  const { noteId, encounterId, fields, editedFields, acceptedCodeIds } = v.data;
  const signedById = session.user.id;

  // ── Guard: note must exist and not be signed yet ──────────────────
  let existing: { status: NoteStatus } | null;
  try {
    existing = await db.clinicalNote.findUnique({
      where:  { id: noteId },
      select: { status: true },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Note not found" }, { status: 404 });
  }
  if (existing.status === NoteStatus.SIGNED) {
    return NextResponse.json({ ok: false, error: "Note is already signed" }, { status: 409 });
  }

  const now = new Date();

  // ── Transaction: update note, codes, encounter ────────────────────
  let savedNote: SavedNote;
  try {
    savedNote = await db.$transaction(async (tx) => {
      await tx.clinicalNote.update({
        where: { id: noteId },
        data: {
          ...fields,
          status:       NoteStatus.SIGNED,
          editedFields,
          signedById,
          signedAt:     now,
        },
      });

      // Two updateMany beats N individual updates for acceptance flags
      await tx.codeSuggestion.updateMany({ where: { noteId }, data: { accepted: false } });
      if (acceptedCodeIds.length > 0) {
        await tx.codeSuggestion.updateMany({
          where: { noteId, id: { in: acceptedCodeIds } },
          data:  { accepted: true },
        });
      }

      await tx.encounter.update({
        where: { id: encounterId },
        data:  { status: EncounterStatus.SIGNED, signedAt: now },
      });

      return tx.clinicalNote.findUniqueOrThrow({
        where:   { id: noteId },
        include: { codes: { orderBy: { confidence: "desc" } } },
      });
    }, { maxWait: 10_000, timeout: 20_000 }); // generous: remote/serverless DB can be slow to wake
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to sign note";
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }

  return NextResponse.json({ ok: true, data: savedNote });
}
