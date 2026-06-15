// Synthetic data only. Run with: npx tsx scripts/test-soap.ts
// Requires ANTHROPIC_API_KEY in the environment.
import { generateNote } from "../src/lib/ai/claude";

const TRANSCRIPTS: Record<string, string> = {
  sinusitis: `
Dr. Patel: Good afternoon. What brings you in today?
Patient (James Whitmore, DOB 03/14/1985, MRN SYNTH-001): I've had terrible congestion for about two weeks now. My face hurts — especially around my cheeks and forehead — and I've had a low-grade fever.
Dr. Patel: Any nasal discharge? What color?
Patient: Yes, thick yellow-green stuff. My sense of smell is almost gone.
Dr. Patel: Any tooth pain or ear pain?
Patient: My upper teeth on the left side have been aching, now that you mention it.
Dr. Patel: Are you on any medications or have any allergies?
Patient: I take a daily multivitamin. I'm allergic to penicillin — I get hives.
Dr. Patel: On exam today you have bilateral maxillary sinus tenderness to palpation, turbinate edema, and purulent posterior nasal drainage. No cervical adenopathy. Lungs are clear to auscultation bilaterally. No fever right now — temp is 98.6. Given two weeks of purulent drainage, facial pressure, and recent low-grade fever, this looks like acute bacterial rhinosinusitis. Because of the penicillin allergy we'll use doxycycline 100 mg twice daily for ten days instead of amoxicillin. I also want you to do saline nasal rinses twice a day and start a fluticasone nasal spray.
Patient: Should I get a CT scan or X-ray?
Dr. Patel: Not at this point — imaging isn't indicated for uncomplicated acute sinusitis. We'll reassess if you're not improving in ten days or if symptoms worsen.
Dr. Patel: Plan is discharge home. Follow up in ten days or return sooner for worsening headache, stiff neck, or visual changes.
`,

  chestPain: `
Triage nurse: Ricardo Torres, 58-year-old male, MRN SYNTH-002, arrived by EMS with chest pain onset approximately two hours ago while mowing the lawn.
Dr. Kim: Mr. Torres, tell me about the pain.
Patient (Ricardo Torres): It's a crushing pressure, right here in the middle of my chest. Seven out of ten. Started when I was mowing.
Dr. Kim: Does it radiate anywhere?
Patient: My left arm feels heavy and my jaw is aching.
Dr. Kim: Shortness of breath, sweating, nausea?
Patient: All three. I'm sweating right now and I feel like I might throw up.
Dr. Kim: Any cardiac history?
Patient: My cardiologist placed a stent in my right coronary artery in 2019. I take metoprolol succinate 50 mg daily, aspirin 81 mg daily, and atorvastatin 40 mg daily.
Dr. Kim: Any allergies?
Patient: None that I know of.
Dr. Kim: Okay, twelve-lead is showing ST elevation in leads II, III, and aVF — inferior STEMI pattern. I'm activating the cath lab now. We're giving aspirin 325 mg chewed, heparin bolus per STEMI protocol, and sublingual nitroglycerin. Calling cardiology.
Nurse: First troponin-I is back — 2.4 ng/mL, elevated.
Dr. Kim: Mr. Torres, you're having a heart attack. We need to take you to the cath lab immediately to open the blocked artery.
Patient: Whatever you have to do, doc.
Dr. Kim: Disposition is admit inpatient to the cardiac care unit following emergent PCI in the cath lab.
`,
};

function divider(char = "=", len = 64) {
  return char.repeat(len);
}

async function main() {
  console.log(divider());
  console.log("Clinical SOAP Note Generator — Quality Review");
  console.log(divider());
  console.log("NOTICE: All patients and clinical content are SYNTHETIC.");
  console.log("AI-generated codes are suggestions — requires clinician sign-off.");
  console.log(divider());

  for (const [name, transcript] of Object.entries(TRANSCRIPTS)) {
    console.log(`\n${divider()}`);
    console.log(`CASE: ${name.toUpperCase()}`);
    console.log(divider());

    const { note, latencyMs } = await generateNote(transcript);

    console.log(`\nLatency: ${latencyMs} ms\n`);

    console.log("── SUBJECTIVE ──────────────────────────────────────────────");
    console.log(note.subjective || "(empty)");

    console.log("\n── OBJECTIVE ───────────────────────────────────────────────");
    console.log(note.objective || "(empty)");

    console.log("\n── ASSESSMENT ──────────────────────────────────────────────");
    console.log(note.assessment || "(empty)");

    console.log("\n── PLAN ────────────────────────────────────────────────────");
    console.log(note.plan || "(empty)");

    console.log(`\n── DISPOSITION ─────────────────────────────────────────────`);
    console.log(`Predicted: ${note.predictedDisposition}`);
    console.log(`Confidence: ${(note.dispositionConfidence * 100).toFixed(0)}%`);

    if (note.orderedLabs.length > 0) {
      console.log("\n── ORDERED LABS ────────────────────────────────────────────");
      note.orderedLabs.forEach((lab) => console.log(`  • ${lab}`));
    }

    if (note.orderedImaging.length > 0) {
      console.log("\n── ORDERED IMAGING ─────────────────────────────────────────");
      note.orderedImaging.forEach((img) => console.log(`  • ${img}`));
    }

    if (note.codes.length > 0) {
      console.log("\n── SUGGESTED CODES (suggestion — requires clinician sign-off) ──");
      note.codes.forEach((c) =>
        console.log(
          `  [${c.system}] ${c.code} — ${c.description} (confidence: ${(c.confidence * 100).toFixed(0)}%)`
        )
      );
    }
  }

  console.log(`\n${divider()}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
