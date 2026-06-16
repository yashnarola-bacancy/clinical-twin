// Synthetic data only. Run with: npx tsx scripts/test-fhir.ts
//
// Pulls one seeded SIGNED encounter (with its note + accepted codes) from the
// DB, builds a FHIR R4 collection bundle from it, validates the shape with the
// Zod schema, and pretty-prints the JSON so you can eyeball the structure.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { buildFhirBundle, FhirBundleSchema } from "../src/lib/fhir/bundle";

const db = new PrismaClient();

function divider(char = "=", len = 72) {
  return char.repeat(len);
}

async function main() {
  console.log(divider());
  console.log("Clinical Twin — FHIR R4 Bundle Builder (structure check)");
  console.log(divider());
  console.log("NOTICE: All patients and clinical content are SYNTHETIC.");
  console.log("ICD-10 Conditions originate from AI suggestions accepted at sign-off.");
  console.log(divider());

  // A note must be SIGNED before it can feed EHR sync, so we only pick from
  // SIGNED/SYNCED encounters that actually carry a signed note.
  const encounter = await db.encounter.findFirst({
    where: {
      status: { in: ["SIGNED", "SYNCED"] },
      note: { isNot: null },
    },
    orderBy: { signedAt: "desc" },
    include: {
      patient: true,
      note: { include: { codes: true } },
    },
  });

  if (!encounter || !encounter.note) {
    console.error(
      "No seeded signed encounter with a note found. Run `npx prisma db seed` first."
    );
    process.exit(1);
  }

  const codes = encounter.note.codes;
  const acceptedIcd = codes.filter((c) => c.system === "ICD10CM" && c.accepted);

  console.log(`\nSource encounter:  ${encounter.id}`);
  console.log(`Patient:           ${encounter.patient.firstName} ${encounter.patient.lastName} (MRN ${encounter.patient.mrn})`);
  console.log(`Department:        ${encounter.department}`);
  console.log(`Chief complaint:   ${encounter.chiefComplaint ?? "(none)"}`);
  console.log(`Status:            ${encounter.status}`);
  console.log(`Check-in:          ${encounter.checkInAt.toISOString()}`);
  console.log(`Discharge (exam):  ${encounter.examEndAt?.toISOString() ?? "(n/a)"}`);
  console.log(`Codes on note:     ${codes.length} total, ${acceptedIcd.length} accepted ICD-10 → Condition resources`);

  // The pure build step — (encounter, note, codes) → FHIR Bundle JSON.
  const bundle = buildFhirBundle(encounter, encounter.note, codes);

  // Validate the produced shape against the Zod schema.
  const result = FhirBundleSchema.safeParse(bundle);
  console.log(`\n${divider("-")}`);
  if (result.success) {
    console.log("✓ Zod validation PASSED — bundle matches FhirBundleSchema.");
  } else {
    console.log("✗ Zod validation FAILED:");
    console.log(JSON.stringify(result.error.issues, null, 2));
  }

  const counts = bundle.entry.reduce<Record<string, number>>((acc, e) => {
    const t = e.resource.resourceType;
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `Resources: ${Object.entries(counts)
      .map(([k, v]) => `${v}× ${k}`)
      .join(", ")}`
  );
  console.log(divider("-"));

  console.log("\nFHIR R4 collection bundle:\n");
  console.log(JSON.stringify(bundle, null, 2));

  console.log(`\n${divider()}`);
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
