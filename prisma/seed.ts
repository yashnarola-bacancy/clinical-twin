import 'dotenv/config'
import {
  PrismaClient,
  Role,
  EncounterStatus,
  Disposition,
  CodeSystem,
  NoteStatus,
} from '@prisma/client'

const prisma = new PrismaClient()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1_000)
}

/** Returns a Date set to `daysAgo` days before now, at the given hour (local). */
function atHour(daysAgo: number, hour: number, minuteOffset = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minuteOffset % 60, 0, 0)
  return d
}

// ---------------------------------------------------------------------------
// Static data tables
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'Michael', 'Jennifer', 'William', 'Linda',
  'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah',
  'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy', 'Matthew', 'Betty',
  'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
]

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
]

const CHIEF_COMPLAINTS = [
  'Chest pain',
  'Shortness of breath',
  'Abdominal pain',
  'Headache',
  'Dizziness and lightheadedness',
  'Fever with chills',
  'Low back pain',
  'Nausea and vomiting',
  'Bilateral lower extremity edema',
  'Syncope episode',
  'Palpitations',
  'Urinary symptoms',
  'Laceration repair',
  'Generalized fatigue',
  'Hemoptysis',
  'Acute vision change',
  'Right hip pain',
  'Altered mental status',
  'Diabetic foot ulcer',
  'Hypertensive urgency',
]

const LAB_PANELS: string[][] = [
  ['CBC', 'BMP'],
  ['CBC', 'CMP', 'Troponin I'],
  ['BMP', 'Lipase', 'LFTs'],
  ['CBC', 'D-dimer', 'PT/INR'],
  ['HbA1c', 'CMP'],
  ['CBC', 'BMP', 'Lactic acid', 'Blood cultures x2'],
  ['TSH', 'CBC'],
  ['BNP', 'CBC', 'BMP', 'Troponin I'],
  ['UA', 'BMP', 'CBC'],
  ['Procalcitonin', 'CBC', 'CMP', 'Blood cultures x2'],
]

const IMAGING_SETS: string[][] = [
  [],
  ['CXR'],
  ['CT Head w/o contrast'],
  ['CT Abdomen/Pelvis w contrast'],
  ['CT PE protocol'],
  ['12-lead EKG'],
  ['Echo', '12-lead EKG'],
  ['Right lower extremity ultrasound'],
]

// Weighted towards DISCHARGE / FOLLOW_UP
const DISPOSITIONS: Disposition[] = [
  Disposition.DISCHARGE, Disposition.DISCHARGE, Disposition.DISCHARGE,
  Disposition.FOLLOW_UP, Disposition.FOLLOW_UP,
  Disposition.ADMIT_WARD, Disposition.ADMIT_WARD,
  Disposition.ADMIT_ICU,
  Disposition.REFERRAL, Disposition.REFERRAL,
]

// 60 encounters: more in recent days, naturally tapering
const ENCOUNTER_DAYS: number[] = [
  ...Array(6).fill(0),   // today          6
  ...Array(5).fill(1),   // yesterday       5
  ...Array(5).fill(2),   //                 5
  ...Array(5).fill(3),   //                 5
  ...Array(4).fill(4),   //                 4
  ...Array(4).fill(5),   //                 4
  ...Array(4).fill(6),   //                 4
  ...Array(4).fill(7),   //                 4
  ...Array(4).fill(8),   //                 4
  ...Array(4).fill(9),   //                 4
  ...Array(3).fill(10),  //                 3
  ...Array(3).fill(11),  //                 3
  ...Array(3).fill(12),  //                 3
  ...Array(6).fill(13),  // 13 days ago     6  (busy historical shift)
]                        //           total 60

// ---------------------------------------------------------------------------
// Status logic — older encounters are naturally further along
// ---------------------------------------------------------------------------

function deriveStatus(daysAgo: number, idx: number): EncounterStatus {
  if (daysAgo >= 8) return EncounterStatus.SYNCED
  if (daysAgo >= 5) return idx % 4 === 0 ? EncounterStatus.SIGNED : EncounterStatus.SYNCED
  if (daysAgo >= 3) {
    const opts = [EncounterStatus.AWAITING_REVIEW, EncounterStatus.SIGNED, EncounterStatus.SYNCED] as const
    return opts[idx % opts.length]
  }
  if (daysAgo === 2) {
    const opts = [EncounterStatus.AWAITING_REVIEW, EncounterStatus.AWAITING_REVIEW, EncounterStatus.SIGNED, EncounterStatus.SYNCED] as const
    return opts[idx % opts.length]
  }
  if (daysAgo === 1) {
    const opts = [EncounterStatus.IN_EXAM, EncounterStatus.AWAITING_REVIEW, EncounterStatus.SIGNED] as const
    return opts[idx % opts.length]
  }
  // today
  const opts = [EncounterStatus.CHECKED_IN, EncounterStatus.CHECKED_IN, EncounterStatus.IN_EXAM, EncounterStatus.AWAITING_REVIEW] as const
  return opts[idx % opts.length]
}

// ---------------------------------------------------------------------------
// SOAP note + code suggestion templates (keyed by complaint category)
// ---------------------------------------------------------------------------

type CodeRow = { system: CodeSystem; code: string; description: string; confidence: number }

type NoteData = {
  subjective: string
  objective: string
  assessment: string
  plan: string
  codes: CodeRow[]
}

function buildNote(complaint: string, age: number, sex: string): NoteData {
  const pt = `${age}yo ${sex === 'M' ? 'male' : 'female'}`

  // Cardiac: chest pain, SOB, palpitations, syncope, edema
  if (/chest|palpita|shortness|syncope|edema/i.test(complaint)) {
    return {
      subjective: `${pt} presenting with ${complaint.toLowerCase()} for approximately 2 hours. Rates discomfort 6/10, pressure-like, substernal with mild radiation to left arm. Diaphoresis noted. Denies fever or pleuritic pain. PMH: hypertension, hyperlipidemia. Meds: lisinopril 10mg, atorvastatin 40mg.`,
      objective: `VS: BP 150/90, HR 96, RR 18, O2Sat 97% RA, Temp 98.6°F. Mild distress. Cardiac: RRR, no murmurs/rubs/gallops. Lungs: CTA bilaterally. No peripheral edema. EKG: NSR, no acute ST/T changes. Serial troponin I <0.04 ng/mL ×2. CXR: no acute cardiopulmonary process.`,
      assessment: `1. ${complaint} — low-probability ACS (HEART score 2). ACS excluded with serial biomarkers.\n2. Hypertension, suboptimally controlled.`,
      plan: `1. Discharge with return precautions for worsening pain, diaphoresis, or syncope.\n2. Cardiology outpatient follow-up within 2 weeks.\n3. Uptitrate lisinopril to 20mg daily.\n4. Exercise stress test ordered outpatient.\n5. Nitroglycerin 0.4mg SL PRN prescribed with instructions.`,
      codes: [
        { system: CodeSystem.ICD10CM, code: 'R07.9',  description: 'Chest pain, unspecified',            confidence: 0.91 },
        { system: CodeSystem.ICD10CM, code: 'I10',    description: 'Essential (primary) hypertension',    confidence: 0.87 },
        { system: CodeSystem.CPT,     code: '99214',  description: 'Office visit, moderate complexity',   confidence: 0.84 },
      ],
    }
  }

  // GI: abdominal pain, nausea, vomiting
  if (/abdomin|nausea|vomit|lipase/i.test(complaint)) {
    return {
      subjective: `${pt} with 12 hours of progressive periumbilical pain migrating to RLQ, 8/10. Associated nausea, one episode of emesis, anorexia. Denies diarrhea or dysuria. Fever 99.8°F at home. PMH: none. Last oral intake 8 hours ago.`,
      objective: `VS: BP 116/72, HR 104, RR 16, O2Sat 99% RA, Temp 99.9°F. Moderate distress. Abdomen: RLQ tenderness, positive rebound at McBurney's, positive Rovsing sign. WBC 13.6 k/µL. CT Abdomen/Pelvis: acute appendicitis, appendiceal diameter 1.1 cm, no perforation.`,
      assessment: `1. Acute appendicitis, uncomplicated (Alvarado score 9).\n2. Leukocytosis, reactive.`,
      plan: `1. NPO. IV access, NS 125 mL/hr.\n2. Surgery consult accepted for laparoscopic appendectomy.\n3. Pre-op antibiotics: cefoxitin 2g IV.\n4. Informed consent obtained. OR scheduled emergently.\n5. Antiemetic: ondansetron 4mg IV PRN.`,
      codes: [
        { system: CodeSystem.ICD10CM, code: 'K37',   description: 'Unspecified appendicitis',              confidence: 0.93 },
        { system: CodeSystem.CPT,     code: '44950', description: 'Appendectomy',                          confidence: 0.89 },
        { system: CodeSystem.CPT,     code: '99284', description: 'ED visit, moderate-high complexity',    confidence: 0.82 },
      ],
    }
  }

  // Neuro: headache, dizziness, AMS, vision change
  if (/head|dizz|altered|vision/i.test(complaint)) {
    return {
      subjective: `${pt} with acute-onset severe headache, "worst of life," thunderclap onset 3 hours ago. 9/10. Photophobia and neck stiffness. No prior similar headaches, no recent trauma. PMH: migraines (last episode 2 years ago). No anticoagulants.`,
      objective: `VS: BP 164/98, HR 84, RR 14, O2Sat 100% RA, Temp 98.7°F. Alert, oriented ×4, significant distress. Meningismus present. Cranial nerves II–XII intact. Motor 5/5 throughout. CT Head w/o contrast: no acute hemorrhage or mass. LP: xanthochromia absent, RBC 2, WBC 1, protein 34, glucose 68.`,
      assessment: `1. Thunderclap headache — subarachnoid hemorrhage excluded by CT + LP.\n2. Probable migraine with atypical features vs. benign thunderclap headache.\n3. Hypertension, likely pain-mediated.`,
      plan: `1. IV ketorolac 30mg, prochlorperazine 10mg, diphenhydramine 25mg — migraine cocktail.\n2. IV fluids 1L NS.\n3. Neurology follow-up within 1 week; MRI Brain/MRA outpatient.\n4. Discontinue OCP if applicable; avoid triggers.\n5. Discharge when pain ≤3/10 and hemodynamically stable.`,
      codes: [
        { system: CodeSystem.ICD10CM, code: 'G43.909', description: 'Migraine, unspecified, not intractable', confidence: 0.76 },
        { system: CodeSystem.ICD10CM, code: 'R51.9',   description: 'Headache, unspecified',                  confidence: 0.88 },
        { system: CodeSystem.CPT,     code: '99285',   description: 'ED visit, high complexity',              confidence: 0.91 },
      ],
    }
  }

  // Infectious / metabolic: fever, UTI, cough, diabetic ulcer
  if (/fever|urinary|cough|hemopt|diabetic/i.test(complaint)) {
    return {
      subjective: `${pt} with 2 days of dysuria, urinary frequency, suprapubic pressure, and subjective fevers (Tmax 101.6°F home). No back or flank pain. PMH: type 2 DM, recurrent UTIs. Meds: metformin 1000mg BID. Recent course TMP-SMX completed 6 days ago.`,
      objective: `VS: BP 126/80, HR 90, RR 14, O2Sat 99% RA, Temp 99.6°F. Mild distress. Abdomen: suprapubic tenderness; no CVA tenderness. UA: nitrites +, LE 3+, WBC >100/hpf, bacteria mod. Urine culture pending. BMP: glucose 152, Cr 1.1 (baseline).`,
      assessment: `1. Uncomplicated cystitis — culture-directed therapy given recent antibiotic exposure.\n2. Type 2 DM with suboptimal glycemic control.`,
      plan: `1. Empiric nitrofurantoin macrocrystals 100mg BID ×5 days pending culture.\n2. Increase fluid intake; avoid caffeine and alcohol.\n3. Call if culture shows resistance — dose adjustment may be needed.\n4. PCP follow-up in 2 weeks for diabetes management and repeat HbA1c.\n5. UTI prevention counseling provided.`,
      codes: [
        { system: CodeSystem.ICD10CM, code: 'N30.00', description: 'Acute cystitis without hematuria',    confidence: 0.92 },
        { system: CodeSystem.ICD10CM, code: 'E11.65', description: 'Type 2 DM with hyperglycemia',        confidence: 0.85 },
        { system: CodeSystem.CPT,     code: '99213',  description: 'Office visit, low-moderate complexity', confidence: 0.87 },
      ],
    }
  }

  // Musculoskeletal / general fallback
  return {
    subjective: `${pt} presenting with ${complaint.toLowerCase()} for the past 24–48 hours. Rates discomfort 5/10. Denies fever, chest pain, or focal neurologic changes. PMH: hypertension. Meds: lisinopril 10mg daily. Takes ibuprofen PRN.`,
    objective: `VS: BP 136/84, HR 76, RR 14, O2Sat 99% RA, Temp 98.4°F. Alert and oriented ×4. No acute distress. Focused exam of relevant system: no acute abnormality. Pertinent labs WNL. Imaging reviewed and interpreted as noted.`,
    assessment: `1. ${complaint} — no emergent etiology identified; likely benign/self-limited course.\n2. Hypertension, stable on current regimen.`,
    plan: `1. Discharge with primary care follow-up within 5–7 days.\n2. Symptomatic management: ibuprofen 600mg TID with food for 5 days.\n3. Return precautions: fever >101°F, worsening symptoms, or new neurologic deficits.\n4. Patient verbalized understanding and agreement with plan.`,
    codes: [
      { system: CodeSystem.ICD10CM, code: 'R68.89', description: 'Other specified general symptoms and signs', confidence: 0.79 },
      { system: CodeSystem.ICD10CM, code: 'I10',    description: 'Essential (primary) hypertension',          confidence: 0.82 },
      { system: CodeSystem.CPT,     code: '99213',  description: 'Office visit, low-moderate complexity',     confidence: 0.80 },
    ],
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('⟳  Clearing existing data…')
  // Delete in FK-safe reverse order
  await prisma.ehrSyncLog.deleteMany()
  await prisma.codeSuggestion.deleteMany()
  await prisma.clinicalNote.deleteMany()
  await prisma.transcript.deleteMany()
  await prisma.encounter.deleteMany()
  await prisma.simulationRun.deleteMany()
  await prisma.patient.deleteMany()
  await prisma.user.deleteMany()

  // -------------------------------------------------------------------------
  // Users — one per role
  // -------------------------------------------------------------------------
  console.log('⟳  Creating users…')
  const [clinician] = await Promise.all([
    prisma.user.create({ data: { name: 'Dr. Sarah Chen',    email: 'sarah.chen@clinicaltwin.dev',    role: Role.CLINICIAN    } }),
    prisma.user.create({ data: { name: 'Marcus Williams',   email: 'marcus.williams@clinicaltwin.dev', role: Role.OPS_DIRECTOR } }),
    prisma.user.create({ data: { name: 'Dr. Priya Patel',  email: 'priya.patel@clinicaltwin.dev',   role: Role.CMIO         } }),
  ])

  // -------------------------------------------------------------------------
  // Patients — 30 with varied ages, realistic fictional names
  // -------------------------------------------------------------------------
  console.log('⟳  Creating patients…')
  const patients = await Promise.all(
    FIRST_NAMES.map((firstName, i) => {
      // Ages 19–83, varied by index so the set is diverse
      const ageYears = 19 + ((i * 3 + 11) % 65)
      const dob = new Date()
      dob.setFullYear(dob.getFullYear() - ageYears)
      dob.setMonth((i * 5) % 12)
      dob.setDate(1 + (i * 7) % 28)
      return prisma.patient.create({
        data: {
          mrn:       `MRN-${String(100_001 + i).padStart(6, '0')}`,
          firstName,
          lastName:  LAST_NAMES[i],
          dob,
          sex:       i % 3 === 0 ? 'M' : i % 3 === 1 ? 'F' : 'M',  // ~2:1 M:F
        },
      })
    })
  )

  // -------------------------------------------------------------------------
  // Encounters — 60 spread across 14 days, 2 per patient
  // -------------------------------------------------------------------------
  console.log('⟳  Creating encounters…')
  let encounterCount = 0
  let transcriptCount = 0
  let noteCount = 0
  let codeCount = 0
  let syncCount = 0

  for (let i = 0; i < ENCOUNTER_DAYS.length; i++) {
    const daysAgo   = ENCOUNTER_DAYS[i]
    const patient   = patients[i % patients.length]
    const complaint = CHIEF_COMPLAINTS[i % CHIEF_COMPLAINTS.length]
    const dept      = i % 5 < 2 ? 'ED' : 'OUTPATIENT'   // ~40 % ED, ~60 % OUTPATIENT
    const labs      = LAB_PANELS[i % LAB_PANELS.length]
    const imaging   = IMAGING_SETS[i % IMAGING_SETS.length]
    const disp      = DISPOSITIONS[i % DISPOSITIONS.length]
    const dispConf  = parseFloat((0.60 + (i % 40) / 100).toFixed(2))  // 0.60–0.99
    const status    = deriveStatus(daysAgo, i)

    // Check-in: spread across 07:00–18:00; today's stay in the AM so they're in the past
    const checkInHour = daysAgo === 0 ? 7 + (i % 6) : 7 + (i % 12)
    const checkInAt   = atHour(daysAgo, checkInHour, i * 7 % 60)

    // Derived timestamps
    const waitMin  = 10 + (i % 25)                   // wait to exam: 10–34 min
    const examMin  = 10 + (i % 31)                   // exam duration: 10–40 min
    const signMin  = 5  + (i % 30)                   // sign delay after exam: 5–34 min
    const syncSec  = 30 + (i % 90)                   // EHR sync delay: 30–119 s

    const needsExamStart = status !== EncounterStatus.CHECKED_IN
    const needsExamEnd   = needsExamStart && status !== EncounterStatus.IN_EXAM
    const needsSigned    = status === EncounterStatus.SIGNED || status === EncounterStatus.SYNCED
    const needsSynced    = status === EncounterStatus.SYNCED

    const examStartAt = needsExamStart ? addMinutes(checkInAt, waitMin) : undefined
    const examEndAt   = needsExamEnd && examStartAt ? addMinutes(examStartAt, examMin) : undefined
    const signedAt    = needsSigned  && examEndAt   ? addMinutes(examEndAt, signMin)   : undefined
    const syncedAt    = needsSynced  && signedAt    ? addSeconds(signedAt, syncSec)    : undefined

    const encounter = await prisma.encounter.create({
      data: {
        patientId:            patient.id,
        clinicianId:          clinician.id,
        status,
        department:           dept,
        chiefComplaint:       complaint,
        checkInAt,
        ...(examStartAt && { examStartAt }),
        ...(examEndAt   && { examEndAt }),
        ...(signedAt    && { signedAt }),
        ...(syncedAt    && { syncedAt }),
        predictedDisposition:  disp,
        dispositionConfidence: dispConf,
        orderedLabs:           labs,
        orderedImaging:        imaging,
      },
    })
    encounterCount++

    // Transcript — present from AWAITING_REVIEW onward
    const hasTranscript =
      status === EncounterStatus.AWAITING_REVIEW ||
      status === EncounterStatus.SIGNED ||
      status === EncounterStatus.SYNCED

    if (hasTranscript) {
      await prisma.transcript.create({
        data: {
          encounterId: encounter.id,
          rawText:
            `[00:00] Clinician: Good morning, I'm Dr. Chen. What brings you in today?\n` +
            `[00:08] Patient: I've been having ${complaint.toLowerCase()} since yesterday.\n` +
            `[00:22] Clinician: Can you rate the severity from 1 to 10?\n` +
            `[00:28] Patient: About a ${5 + (i % 5)} out of 10.\n` +
            `[00:45] Clinician: Any associated symptoms — fever, nausea, changes in vision?\n` +
            `[01:02] Patient: Some mild fever last night, nothing else notable.\n` +
            `[01:18] Clinician: Any relevant medical history or current medications?\n` +
            `[01:32] Patient: Hypertension — I take lisinopril. That's it.\n` +
            `[01:47] Clinician: Alright, let me do a focused exam. I'll be right back.`,
          durationSec:  180 + (i % 240),
          audioDeleted: true,
        },
      })
      transcriptCount++
    }

    // Clinical note — present from SIGNED onward
    const hasNote = status === EncounterStatus.SIGNED || status === EncounterStatus.SYNCED
    if (hasNote && signedAt) {
      const ageYears = Math.floor(
        (Date.now() - patient.dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      )
      const noteData = buildNote(complaint, ageYears, patient.sex)

      const note = await prisma.clinicalNote.create({
        data: {
          encounterId:  encounter.id,
          status:       NoteStatus.SIGNED,
          subjective:   noteData.subjective,
          objective:    noteData.objective,
          assessment:   noteData.assessment,
          plan:         noteData.plan,
          aiModel:      'claude-sonnet-4-6',
          generationMs: 650 + (i % 2100),           // 650–2750 ms — realistic LLM latency
          editedFields: i % 4 === 0 ? ['plan']
                      : i % 4 === 1 ? ['assessment', 'plan']
                      : [],
          signedById: clinician.id,
          signedAt,
        },
      })
      noteCount++

      // Code suggestions
      for (const c of noteData.codes) {
        await prisma.codeSuggestion.create({
          data: {
            noteId:      note.id,
            system:      c.system,
            code:        c.code,
            description: c.description,
            confidence:  c.confidence,
            accepted:    i % 9 !== 0,   // ~89 % accepted, occasional clinician rejection
          },
        })
        codeCount++
      }
    }

    // EHR sync log — SYNCED encounters only
    if (status === EncounterStatus.SYNCED && syncedAt) {
      await prisma.ehrSyncLog.create({
        data: {
          encounterId: encounter.id,
          fhirBundle: {
            resourceType: 'Bundle',
            type:         'transaction',
            id:           `bundle-enc-${i}`,
            timestamp:    syncedAt.toISOString(),
            entry: [
              {
                resource: {
                  resourceType: 'Encounter',
                  id:           encounter.id,
                  status:       'finished',
                  subject:      { reference: `Patient/${patient.id}` },
                },
              },
              {
                resource: {
                  resourceType: 'Patient',
                  id:           patient.id,
                  name:         [{ family: patient.lastName, given: [patient.firstName] }],
                  birthDate:    patient.dob.toISOString().split('T')[0],
                  gender:       patient.sex === 'M' ? 'male' : 'female',
                },
              },
            ],
          },
          latencyMs: 120 + (i % 850),   // 120–969 ms EHR sync
          success:   true,
        },
      })
      syncCount++
    }
  }

  console.log('\n✓  Seed complete')
  console.log(`   Users:         3`)
  console.log(`   Patients:      ${patients.length}`)
  console.log(`   Encounters:    ${encounterCount}`)
  console.log(`   Transcripts:   ${transcriptCount}`)
  console.log(`   Clinical notes:${noteCount}`)
  console.log(`   Code suggestions: ${codeCount}`)
  console.log(`   EHR sync logs: ${syncCount}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
