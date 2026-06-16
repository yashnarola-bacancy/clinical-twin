import { z } from "zod";

// ---------------------------------------------------------------------------
// Clinical Twin → (mock) EHR FHIR R4 export
//
// buildFhirBundle() is a PURE function: (encounter, note, codes) → JSON object.
// No DB, no fetch, no Date.now() — every value is derived from its inputs, so
// the same encounter always produces the same bundle (testable & rerunnable).
//
// SYNTHETIC DATA ONLY. ICD-10 codes here are AI suggestions that a clinician
// has accepted at sign-off; each Condition carries its AI confidence as an
// extension so downstream systems can see the provenance.
// ---------------------------------------------------------------------------

const FHIR_BASE = "https://clinicaltwin.dev/fhir";

// Custom extension URL stamping the AI confidence onto a suggested Condition.
const AI_CONFIDENCE_EXT =
  "https://clinicaltwin.dev/fhir/StructureDefinition/ai-suggestion-confidence";

// Code system URIs (FHIR R4 canonical identifiers).
const SYSTEM_URI = {
  ICD10CM: "http://hl7.org/fhir/sid/icd-10-cm",
  MRN: "https://clinicaltwin.dev/fhir/mrn",
  ACT_CODE: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
  CONDITION_CLINICAL:
    "http://terminology.hl7.org/CodeSystem/condition-clinical",
  CONDITION_VER: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
  CONDITION_CATEGORY:
    "http://terminology.hl7.org/CodeSystem/condition-category",
  LOINC: "http://loinc.org",
} as const;

// ---------------------------------------------------------------------------
// Input shapes — structural so they accept Prisma rows without depending on
// the Prisma client at module load (keeps this file pure & cheap to import).
// ---------------------------------------------------------------------------

type DateInput = Date | string;

export interface PatientInput {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dob: DateInput;
  sex: string; // "M" | "F" | ...
}

export interface EncounterInput {
  id: string;
  status: string; // EncounterStatus
  department: string; // "ED" | "OUTPATIENT" | "ICU" ...
  chiefComplaint?: string | null;
  checkInAt: DateInput;
  examStartAt?: DateInput | null;
  examEndAt?: DateInput | null;
  signedAt?: DateInput | null;
  syncedAt?: DateInput | null;
  predictedDisposition?: string | null;
  patient: PatientInput;
}

export interface NoteInput {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  status?: string | null; // NoteStatus
  signedAt?: DateInput | null;
}

export interface CodeInput {
  system: string; // "ICD10CM" | "CPT" | "SNOMEDCT"
  code: string;
  description: string;
  confidence: number; // 0..1
  accepted: boolean;
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function toIso(value: DateInput): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** YYYY-MM-DD (FHIR `date` for birthDate). */
function toDateOnly(value: DateInput): string {
  return toIso(value).slice(0, 10);
}

function fhirGender(sex: string): "male" | "female" | "other" | "unknown" {
  const s = sex.trim().toUpperCase();
  if (s === "M" || s === "MALE") return "male";
  if (s === "F" || s === "FEMALE") return "female";
  if (s === "O" || s === "OTHER") return "other";
  return "unknown";
}

/** EncounterStatus → FHIR R4 Encounter.status. */
function fhirEncounterStatus(status: string): string {
  switch (status) {
    case "CHECKED_IN":
      return "arrived";
    case "IN_EXAM":
    case "AWAITING_REVIEW":
      return "in-progress";
    case "SIGNED":
    case "SYNCED":
      return "finished";
    default:
      return "unknown";
  }
}

/** Department → FHIR Encounter.class (v3 ActCode). */
function fhirEncounterClass(department: string): { system: string; code: string; display: string } {
  switch (department.trim().toUpperCase()) {
    case "ED":
      return { system: SYSTEM_URI.ACT_CODE, code: "EMER", display: "emergency" };
    case "ICU":
      return { system: SYSTEM_URI.ACT_CODE, code: "IMP", display: "inpatient encounter" };
    case "OUTPATIENT":
    default:
      return { system: SYSTEM_URI.ACT_CODE, code: "AMB", display: "ambulatory" };
  }
}

/** Disposition enum → human-readable discharge disposition text. */
function dischargeDispositionText(disposition: string): string | null {
  switch (disposition) {
    case "DISCHARGE":
      return "Discharged home";
    case "ADMIT_WARD":
      return "Admitted to ward";
    case "ADMIT_ICU":
      return "Admitted to ICU";
    case "REFERRAL":
      return "Referred to specialist";
    case "FOLLOW_UP":
      return "Discharged with follow-up";
    default:
      return null;
  }
}

/** Render the four SOAP sections into a single plain-text document. */
function renderSoapText(note: NoteInput): string {
  return [
    "SUBJECTIVE:",
    note.subjective || "(not documented)",
    "",
    "OBJECTIVE:",
    note.objective || "(not documented)",
    "",
    "ASSESSMENT:",
    note.assessment || "(not documented)",
    "",
    "PLAN:",
    note.plan || "(not documented)",
    "",
    "— AI-assisted draft, reviewed and signed by the attending clinician.",
  ].join("\n");
}

function base64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

/** Build a FHIR-safe id fragment from an ICD-10 code (e.g. "J06.9" → "j06-9"). */
function codeSlug(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// buildFhirBundle — the public, pure entry point
// ---------------------------------------------------------------------------

export function buildFhirBundle(
  encounter: EncounterInput,
  note: NoteInput,
  codes: CodeInput[]
): FhirBundle {
  const patient = encounter.patient;

  // Relative references resolve against each entry's fullUrl base.
  const patientRef = `Patient/${patient.id}`;
  const encounterRef = `Encounter/${encounter.id}`;

  // Discharge ≈ when the patient left the exam; fall back through the pipeline.
  const dischargeAt =
    encounter.examEndAt ?? encounter.signedAt ?? encounter.syncedAt ?? null;

  // Bundle timestamp comes from the data, never the wall clock.
  const bundleTimestamp = toIso(
    encounter.syncedAt ?? note.signedAt ?? encounter.signedAt ?? encounter.checkInAt
  );

  // --- Patient -------------------------------------------------------------
  const patientResource = {
    resourceType: "Patient" as const,
    id: patient.id,
    identifier: [
      {
        use: "usual",
        type: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v2-0203",
              code: "MR",
              display: "Medical record number",
            },
          ],
        },
        system: SYSTEM_URI.MRN,
        value: patient.mrn,
      },
    ],
    name: [
      {
        use: "official",
        family: patient.lastName,
        given: [patient.firstName],
      },
    ],
    gender: fhirGender(patient.sex),
    birthDate: toDateOnly(patient.dob),
  };

  // --- Encounter -----------------------------------------------------------
  const cls = fhirEncounterClass(encounter.department);
  const dischargeText = encounter.predictedDisposition
    ? dischargeDispositionText(encounter.predictedDisposition)
    : null;

  const encounterResource = {
    resourceType: "Encounter" as const,
    id: encounter.id,
    status: fhirEncounterStatus(encounter.status),
    class: cls,
    subject: { reference: patientRef },
    serviceProvider: { display: encounter.department },
    period: {
      start: toIso(encounter.checkInAt),
      ...(dischargeAt ? { end: toIso(dischargeAt) } : {}),
    },
    ...(encounter.chiefComplaint
      ? { reasonCode: [{ text: encounter.chiefComplaint }] }
      : {}),
    location: [
      {
        location: { display: encounter.department },
        status: "completed",
      },
    ],
    ...(dischargeText
      ? { hospitalization: { dischargeDisposition: { text: dischargeText } } }
      : {}),
  };

  // --- Conditions (one per ACCEPTED ICD-10 code) ---------------------------
  const recordedDate = toIso(note.signedAt ?? encounter.signedAt ?? bundleTimestamp);

  const conditionResources = codes
    .filter((c) => c.system === "ICD10CM" && c.accepted)
    .map((c) => ({
      resourceType: "Condition" as const,
      id: `condition-${encounter.id}-${codeSlug(c.code)}`,
      clinicalStatus: {
        coding: [
          { system: SYSTEM_URI.CONDITION_CLINICAL, code: "active", display: "Active" },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: SYSTEM_URI.CONDITION_VER,
            code: "confirmed",
            display: "Confirmed",
          },
        ],
      },
      category: [
        {
          coding: [
            {
              system: SYSTEM_URI.CONDITION_CATEGORY,
              code: "encounter-diagnosis",
              display: "Encounter Diagnosis",
            },
          ],
        },
      ],
      code: {
        coding: [
          { system: SYSTEM_URI.ICD10CM, code: c.code, display: c.description },
        ],
        text: c.description,
      },
      subject: { reference: patientRef },
      encounter: { reference: encounterRef },
      recordedDate,
      // Provenance: this diagnosis began as an AI suggestion with this confidence.
      extension: [{ url: AI_CONFIDENCE_EXT, valueDecimal: c.confidence }],
    }));

  // --- DocumentReference (the signed SOAP note) ----------------------------
  const docStatus = (note.status ?? "").toUpperCase() === "SIGNED" ? "final" : "preliminary";

  const documentReferenceResource = {
    resourceType: "DocumentReference" as const,
    id: `docref-${encounter.id}`,
    status: "current",
    docStatus,
    type: {
      coding: [
        { system: SYSTEM_URI.LOINC, code: "11506-3", display: "Progress note" },
      ],
      text: "SOAP Note",
    },
    subject: { reference: patientRef },
    date: recordedDate,
    content: [
      {
        attachment: {
          contentType: "text/plain",
          title: "SOAP Note",
          data: base64(renderSoapText(note)),
        },
      },
    ],
    context: {
      encounter: [{ reference: encounterRef }],
      ...(dischargeAt
        ? { period: { start: toIso(encounter.checkInAt), end: toIso(dischargeAt) } }
        : {}),
    },
  };

  // --- Assemble the collection bundle --------------------------------------
  const bundle = {
    resourceType: "Bundle" as const,
    type: "collection" as const,
    timestamp: bundleTimestamp,
    entry: [
      { fullUrl: `${FHIR_BASE}/${patientRef}`, resource: patientResource },
      { fullUrl: `${FHIR_BASE}/${encounterRef}`, resource: encounterResource },
      ...conditionResources.map((resource) => ({
        fullUrl: `${FHIR_BASE}/Condition/${resource.id}`,
        resource,
      })),
      {
        fullUrl: `${FHIR_BASE}/DocumentReference/${documentReferenceResource.id}`,
        resource: documentReferenceResource,
      },
    ],
  };

  return bundle as FhirBundle;
}

// ---------------------------------------------------------------------------
// Zod schema — validates the shape of a bundle produced above
// ---------------------------------------------------------------------------

const ReferenceSchema = z.object({ reference: z.string().min(1) });

const CodingSchema = z.object({
  system: z.string().optional(),
  code: z.string().optional(),
  display: z.string().optional(),
});

const CodeableConceptSchema = z.object({
  coding: z.array(CodingSchema).optional(),
  text: z.string().optional(),
});

const PatientResourceSchema = z.object({
  resourceType: z.literal("Patient"),
  id: z.string().min(1),
  identifier: z
    .array(z.object({ system: z.string().optional(), value: z.string() }))
    .min(1),
  name: z
    .array(z.object({ family: z.string(), given: z.array(z.string()) }))
    .min(1),
  gender: z.enum(["male", "female", "other", "unknown"]),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const EncounterResourceSchema = z.object({
  resourceType: z.literal("Encounter"),
  id: z.string().min(1),
  status: z.string().min(1),
  class: CodingSchema,
  subject: ReferenceSchema,
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime().optional(),
  }),
});

const ConditionResourceSchema = z.object({
  resourceType: z.literal("Condition"),
  id: z.string().min(1),
  clinicalStatus: CodeableConceptSchema,
  verificationStatus: CodeableConceptSchema,
  code: CodeableConceptSchema,
  subject: ReferenceSchema,
  encounter: ReferenceSchema,
  extension: z
    .array(z.object({ url: z.string(), valueDecimal: z.number().min(0).max(1) }))
    .optional(),
});

const DocumentReferenceResourceSchema = z.object({
  resourceType: z.literal("DocumentReference"),
  id: z.string().min(1),
  status: z.string().min(1),
  subject: ReferenceSchema,
  content: z
    .array(
      z.object({
        attachment: z.object({
          contentType: z.string(),
          data: z.string().min(1),
          title: z.string().optional(),
        }),
      })
    )
    .min(1),
});

const BundleEntrySchema = z.object({
  fullUrl: z.string().min(1),
  resource: z.discriminatedUnion("resourceType", [
    PatientResourceSchema,
    EncounterResourceSchema,
    ConditionResourceSchema,
    DocumentReferenceResourceSchema,
  ]),
});

export const FhirBundleSchema = z
  .object({
    resourceType: z.literal("Bundle"),
    type: z.literal("collection"),
    timestamp: z.string().datetime(),
    entry: z.array(BundleEntrySchema).min(3),
  })
  .refine(
    (b) => b.entry.some((e) => e.resource.resourceType === "Patient"),
    "Bundle must contain a Patient resource"
  )
  .refine(
    (b) => b.entry.some((e) => e.resource.resourceType === "Encounter"),
    "Bundle must contain an Encounter resource"
  )
  .refine(
    (b) => b.entry.some((e) => e.resource.resourceType === "DocumentReference"),
    "Bundle must contain a DocumentReference resource"
  );

export type FhirBundle = z.infer<typeof FhirBundleSchema>;
