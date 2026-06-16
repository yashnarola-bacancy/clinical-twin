import Anthropic from "@anthropic-ai/sdk";
import { SoapNoteSchema, SoapNote, SOAP_SYSTEM_PROMPT } from "./soap-prompt";

const client = new Anthropic();

// Returned when MOCK_AI=true — sinusitis outpatient, discharge-home
const MOCK_NOTE: SoapNote = {
  subjective:
    "The patient presents with two weeks of nasal congestion, facial pressure over bilateral cheeks and forehead, low-grade fever, thick yellow-green nasal discharge, reduced sense of smell, and left upper tooth pain. Allergic to penicillin (hives). Takes a daily multivitamin.",
  objective:
    "Temperature 98.6°F. Bilateral maxillary sinus tenderness to palpation. Turbinate edema noted. Purulent posterior nasal drainage. No cervical adenopathy. Lungs clear to auscultation bilaterally.",
  assessment:
    "Acute bacterial rhinosinusitis. Penicillin allergy precludes amoxicillin-based therapy.",
  plan:
    "Doxycycline 100 mg PO twice daily × 10 days. Saline nasal rinses twice daily. Fluticasone propionate nasal spray once daily. Return precautions: worsening headache, stiff neck, or visual changes. Follow up in 10 days.",
  predictedDisposition: "discharge-home",
  dispositionConfidence: 0.97,
  orderedLabs: [],
  orderedImaging: [],
  codes: [
    {
      system: "ICD10CM",
      code: "J01.90",
      description: "Acute sinusitis, unspecified",
      confidence: 0.88,
    },
    {
      system: "ICD10CM",
      code: "Z88.0",
      description: "Allergy status to penicillin",
      confidence: 0.95,
    },
    {
      system: "CPT",
      code: "99213",
      description: "Office visit, established patient, low-moderate medical decision making",
      confidence: 0.82,
    },
  ],
};

export interface GenerateNoteResult {
  note: SoapNote;
  latencyMs: number;
}

async function callClaude(messages: Anthropic.MessageParam[]): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SOAP_SYSTEM_PROMPT,
    messages,
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected Claude response type: ${block.type}`);
  }
  return block.text;
}

export async function generateNote(transcript: string): Promise<GenerateNoteResult> {
  if (process.env.MOCK_AI === "true") {
    await new Promise((r) => setTimeout(r, 1000));
    return { note: MOCK_NOTE, latencyMs: 1000 };
  }

  const start = performance.now();

  const userMessage: Anthropic.MessageParam = { role: "user", content: transcript };

  const rawText = await callClaude([userMessage]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Retry once with corrective prompt
    const retryText = await callClaude([
      userMessage,
      { role: "assistant", content: rawText },
      {
        role: "user",
        content:
          "Your previous response could not be parsed as JSON. Output only the raw JSON object with no markdown fences, no explanation, matching the schema exactly.",
      },
    ]);
    parsed = JSON.parse(retryText);
  }

  const note = SoapNoteSchema.parse(parsed);
  const latencyMs = Math.round(performance.now() - start);

  return { note, latencyMs };
}
