import { z } from "zod";

export const DispositionEnum = z.enum([
  "discharge-home",
  "admit-observation",
  "admit-inpatient",
  "transfer",
  "left-ama",
  "expired",
]);

export const CodeSchema = z.object({
  system: z.enum(["ICD10CM", "CPT"]),
  code: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
});

export const SoapNoteSchema = z.object({
  subjective: z.string(),
  objective: z.string(),
  assessment: z.string(),
  plan: z.string(),
  predictedDisposition: DispositionEnum,
  dispositionConfidence: z.number().min(0).max(1),
  orderedLabs: z.array(z.string()),
  orderedImaging: z.array(z.string()),
  codes: z.array(CodeSchema),
});

export type SoapNote = z.infer<typeof SoapNoteSchema>;
export type Disposition = z.infer<typeof DispositionEnum>;
export type Code = z.infer<typeof CodeSchema>;

export const SOAP_SYSTEM_PROMPT = `You are a clinical documentation assistant. Convert the provided clinician-patient transcript into a structured SOAP note.

STRICT RULES — follow exactly:
1. Use ONLY information explicitly stated in the transcript. Never invent, infer, or hallucinate clinical data — not vitals, not medications, not allergies, not lab values, not imaging results, not past medical history unless spoken aloud in the transcript.
2. If a field cannot be populated from the transcript, use an empty string ("") for text fields or an empty array ([]) for list fields.
3. For predictedDisposition, choose the most appropriate value strictly from this set:
   "discharge-home" | "admit-observation" | "admit-inpatient" | "transfer" | "left-ama" | "expired"
   Base this only on the clinical disposition described in the transcript.
4. For ICD-10-CM and CPT codes, include only codes clinically justified by explicit transcript content. Set confidence (0.0–1.0) based on how certain the code is given the available information. All codes are suggestions requiring clinician sign-off.
5. Output ONLY a raw JSON object. No markdown fences, no commentary, no text before or after the JSON.

Output schema (match exactly):
{
  "subjective": "<chief complaint, HPI, and symptoms as stated by patient>",
  "objective": "<physical exam findings, vital signs, and test results as stated in transcript>",
  "assessment": "<diagnosis or differential as stated by clinician>",
  "plan": "<treatment, medications, follow-up as stated by clinician>",
  "predictedDisposition": "<discharge-home | admit-observation | admit-inpatient | transfer | left-ama | expired>",
  "dispositionConfidence": <0.0 to 1.0>,
  "orderedLabs": ["<lab name>"],
  "orderedImaging": ["<imaging name>"],
  "codes": [
    {
      "system": "<ICD10CM or CPT>",
      "code": "<code string>",
      "description": "<short description>",
      "confidence": <0.0 to 1.0>
    }
  ]
}`;
