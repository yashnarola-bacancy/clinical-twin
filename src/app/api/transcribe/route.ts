import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { transcribeAudio } from "@/lib/ai/transcribe";

const RequestSchema = z.object({
  encounterId: z.string().min(1, "encounterId is required"),
  // client-measured recording length; coerce from form string → int
  durationSec: z.coerce.number().int().min(0).optional(),
});

type TranscribeData = { text: string; durationSec: number | null };
type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<TranscribeData>>> {
  // ── Parse FormData ────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  // ── Validate text fields ──────────────────────────────────────────
  const validation = RequestSchema.safeParse({
    encounterId: formData.get("encounterId"),
    durationSec: formData.get("durationSec") ?? undefined,
  });
  if (!validation.success) {
    return NextResponse.json(
      { ok: false, error: validation.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const { encounterId, durationSec } = validation.data;
  const isMock = process.env.MOCK_AI === "true";

  // ── Validate audio file (skipped in mock mode) ────────────────────
  let audio: Blob = new Blob([]);
  if (!isMock) {
    const entry = formData.get("audio");
    if (!(entry instanceof Blob) || entry.size === 0) {
      return NextResponse.json(
        { ok: false, error: "audio field must be a non-empty file" },
        { status: 400 }
      );
    }
    audio = entry;
  }

  // ── Verify encounter exists ───────────────────────────────────────
  try {
    const encounter = await db.encounter.findUnique({
      where: { id: encounterId },
      select: { id: true },
    });
    if (!encounter) {
      return NextResponse.json(
        { ok: false, error: "Encounter not found" },
        { status: 404 }
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Database unavailable" },
      { status: 503 }
    );
  }

  // ── Transcribe ────────────────────────────────────────────────────
  let text: string;
  try {
    text = await transcribeAudio(audio);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  // ── Persist (upsert allows re-recording the same encounter) ───────
  // audioDeleted is always true per domain rules: we never store audio.
  try {
    await db.transcript.upsert({
      where: { encounterId },
      create: {
        encounterId,
        rawText: text,
        durationSec: durationSec ?? null,
        audioDeleted: true,
      },
      update: {
        rawText: text,
        durationSec: durationSec ?? null,
        audioDeleted: true,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to save transcript" },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, data: { text, durationSec: durationSec ?? null } });
}
