import OpenAI from "openai";

// Returned when MOCK_AI=true — matches the sinusitis mock note in claude.ts
const MOCK_TRANSCRIPT = `
Dr. Patel: Good afternoon. What brings you in today?
Patient: I've had terrible congestion for about two weeks now. My face hurts — especially around my cheeks and forehead — and I've had a low-grade fever.
Dr. Patel: Any nasal discharge? What color?
Patient: Yes, thick yellow-green stuff. My sense of smell is almost gone.
Dr. Patel: Any tooth pain or ear pain?
Patient: My upper teeth on the left side have been aching, now that you mention it.
Dr. Patel: Are you on any medications or have any allergies?
Patient: I take a daily multivitamin. I'm allergic to penicillin — I get hives.
Dr. Patel: On exam you have bilateral maxillary sinus tenderness to palpation, turbinate edema, and purulent posterior nasal drainage. No cervical adenopathy. Lungs clear. Temp 98.6. Given two weeks of purulent drainage and facial pressure this looks like acute bacterial rhinosinusitis. Because of the penicillin allergy we'll use doxycycline 100 mg twice daily for ten days. Also saline nasal rinses twice a day and fluticasone nasal spray.
Dr. Patel: Plan is discharge home. Follow up in ten days or return sooner for worsening headache, stiff neck, or vision changes.
`.trim();

export async function transcribeAudio(audio: Blob): Promise<string> {
  if (process.env.MOCK_AI === "true") {
    await new Promise((r) => setTimeout(r, 800));
    return MOCK_TRANSCRIPT;
  }

  const openai = new OpenAI();
  const file = new File([audio], "recording.webm", { type: audio.type });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "en",
  });
  return result.text;
}
