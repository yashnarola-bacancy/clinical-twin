import {
  PrismaClient,
  Role,
  EncounterStatus,
  Disposition,
  CodeSystem,
  NoteStatus,
  type Patient,
} from '@prisma/client'

// ---------------------------------------------------------------------------
// Shared synthetic-data seeder.
//
// This is the single source of truth for demo data. It is called by:
//   • prisma/seed.ts          (CLI: `npx prisma db seed`)
//   • the /settings re-seed    (server action, via the shared `db` singleton)
//
// All patients, MRNs, and clinical content are SYNTHETIC and clearly fictional.
// The function CLEARS all existing data first (in FK-safe order) and then
// regenerates a fresh, self-consistent dataset, so it is safe to run repeatedly.
// ---------------------------------------------------------------------------

export type SeedSummary = {
  users:       number
  patients:    number
  encounters:  number
  transcripts: number
  notes:       number
  codes:       number
  syncLogs:    number
}

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
// Curated "showcase" encounters
//
// A small set of hand-written, fully-signed encounters with clean, high-quality
// notes (no clinician edits, all codes accepted). These guarantee the KPIs and
// the twin simulation have strong, realistic data the instant a reset finishes:
//   • clean signed notes  → "signed without edits" accuracy KPI
//   • generationMs set     → avg note-generation KPI
//   • exam start/end set   → twin exam-duration calibration
//   • one ADMIT_WARD       → twin admission-rate calibration
//   • two SYNCED + sync log→ EHR-sync-latency KPI
// ---------------------------------------------------------------------------

type Showcase = {
  patient:        { firstName: string; lastName: string; mrn: string; ageYears: number; sex: 'M' | 'F' }
  department:     'ED' | 'OUTPATIENT'
  chiefComplaint: string
  disposition:    Disposition
  dispositionConfidence: number
  orderedLabs:    string[]
  orderedImaging: string[]
  daysAgo:        number
  checkInHour:    number
  waitMin:        number
  examMin:        number
  signMin:        number
  /** Seconds from sign-off to EHR sync; null means SIGNED but not yet synced. */
  syncSec:        number | null
  generationMs:   number
  syncLatencyMs:  number
  note:           { subjective: string; objective: string; assessment: string; plan: string }
  codes:          CodeRow[]
  transcript:     string
}

const SHOWCASE_ENCOUNTERS: Showcase[] = [
  // 1 — Community-acquired pneumonia, admitted to the ward (ED, SYNCED)
  {
    patient: { firstName: 'Eleanor', lastName: 'Hayes', mrn: 'MRN-900001', ageYears: 67, sex: 'F' },
    department: 'ED',
    chiefComplaint: 'Productive cough and fever',
    disposition: Disposition.ADMIT_WARD,
    dispositionConfidence: 0.88,
    orderedLabs: ['CBC', 'CMP', 'Lactic acid', 'Blood cultures x2'],
    orderedImaging: ['CXR'],
    daysAgo: 2,
    checkInHour: 9,
    waitMin: 16,
    examMin: 32,
    signMin: 11,
    syncSec: 92,
    generationMs: 1480,
    syncLatencyMs: 260,
    note: {
      subjective:
        '67yo female with 4 days of productive cough with rust-colored sputum, subjective fevers to 102°F, and progressive dyspnea on exertion. Reports right-sided pleuritic chest pain with deep inspiration and decreased oral intake. PMH: COPD, hypertension. Meds: tiotropium inhaler, amlodipine 5mg. Former smoker, 30 pack-years, quit 8 years ago. NKDA.',
      objective:
        'VS: BP 132/78, HR 104, RR 22, O2Sat 90% on room air, Temp 101.7°F. Ill-appearing, mild respiratory distress. Lungs: decreased breath sounds with crackles over the right lower lobe and egophony. Cardiac: tachycardic, regular rhythm. CXR: right lower lobe consolidation consistent with lobar pneumonia. WBC 15.2 k/µL with neutrophilic predominance. Lactic acid 1.8 mmol/L. CURB-65 score 2.',
      assessment:
        '1. Community-acquired pneumonia, right lower lobe — moderate severity (CURB-65 2), meeting criteria for inpatient admission.\n2. Hypoxemia, responsive to supplemental oxygen.\n3. COPD, currently at baseline.',
      plan:
        '1. Admit to medicine ward for IV antibiotics and supplemental oxygen.\n2. Ceftriaxone 1g IV daily plus azithromycin 500mg IV daily per CAP guidelines.\n3. Oxygen via nasal cannula titrated to SpO2 ≥ 92%.\n4. Blood cultures ×2 and sputum culture obtained prior to antibiotics.\n5. Continue home COPD regimen; albuterol nebulizer PRN.\n6. Reassess oxygen requirement and clinical response in the morning.',
    },
    codes: [
      { system: CodeSystem.ICD10CM, code: 'J18.1',  description: 'Lobar pneumonia, unspecified organism',   confidence: 0.94 },
      { system: CodeSystem.ICD10CM, code: 'J96.01', description: 'Acute respiratory failure with hypoxia',  confidence: 0.80 },
      { system: CodeSystem.CPT,     code: '99223',  description: 'Initial hospital care, high complexity',  confidence: 0.86 },
    ],
    transcript:
      `[00:00] Clinician: Hi, I'm Dr. Chen. I understand you've had a cough and fevers?\n` +
      `[00:07] Patient: Yes, about four days now. The cough brings up rusty-colored phlegm and I've been short of breath.\n` +
      `[00:19] Clinician: Any chest pain with breathing?\n` +
      `[00:23] Patient: Sharp pain on the right side when I take a deep breath.\n` +
      `[00:33] Clinician: Your oxygen is a little low and the chest x-ray shows pneumonia in the right lower lung. I'd like to admit you for IV antibiotics and oxygen.\n` +
      `[00:48] Patient: Okay, whatever you think is best.`,
  },

  // 2 — Acute bacterial sinusitis, discharged (OUTPATIENT, SYNCED)
  {
    patient: { firstName: 'Daniel', lastName: 'Brooks', mrn: 'MRN-900002', ageYears: 35, sex: 'M' },
    department: 'OUTPATIENT',
    chiefComplaint: 'Facial pressure and nasal congestion',
    disposition: Disposition.DISCHARGE,
    dispositionConfidence: 0.95,
    orderedLabs: [],
    orderedImaging: [],
    daysAgo: 1,
    checkInHour: 11,
    waitMin: 9,
    examMin: 18,
    signMin: 6,
    syncSec: 64,
    generationMs: 990,
    syncLatencyMs: 185,
    note: {
      subjective:
        '35yo male with 10 days of nasal congestion, purulent nasal discharge, and maxillary facial pressure that worsens when leaning forward. Initial improvement around day 5 followed by worsening symptoms ("double sickening"). Subjective low-grade fever. Denies vision changes, severe headache, or neck stiffness. PMH: seasonal allergic rhinitis. Meds: cetirizine PRN. NKDA.',
      objective:
        'VS: BP 124/76, HR 78, RR 14, O2Sat 99% on room air, Temp 99.4°F. Well-appearing, no acute distress. HEENT: tenderness to palpation over bilateral maxillary sinuses, mucopurulent discharge at the middle meatus, boggy nasal turbinates. Oropharynx without exudate. No periorbital swelling or proptosis. Lungs clear to auscultation.',
      assessment:
        '1. Acute bacterial rhinosinusitis — symptoms beyond 10 days with a double-sickening pattern.\n2. Allergic rhinitis, contributing.',
      plan:
        '1. Amoxicillin-clavulanate 875/125mg PO BID for 7 days.\n2. Intranasal fluticasone, 2 sprays each nostril daily.\n3. Saline nasal irrigation and acetaminophen PRN for pain.\n4. Return precautions: vision changes, periorbital swelling, severe or worsening headache, or high fever.\n5. Primary care follow-up if not improved in 7 days.',
    },
    codes: [
      { system: CodeSystem.ICD10CM, code: 'J01.00', description: 'Acute maxillary sinusitis, unspecified', confidence: 0.92 },
      { system: CodeSystem.ICD10CM, code: 'J30.2',  description: 'Other seasonal allergic rhinitis',       confidence: 0.83 },
      { system: CodeSystem.CPT,     code: '99213',  description: 'Office visit, low-moderate complexity',  confidence: 0.88 },
    ],
    transcript:
      `[00:00] Clinician: Good morning, what's been going on?\n` +
      `[00:05] Patient: I've had congestion and facial pressure for about ten days. It got a little better, then came back worse.\n` +
      `[00:17] Clinician: Any thick discharge or fever?\n` +
      `[00:21] Patient: Yellow-green discharge and a low fever last night.\n` +
      `[00:31] Clinician: Your maxillary sinuses are tender. This looks like a bacterial sinus infection, so I'll start an antibiotic and a nasal steroid.\n` +
      `[00:44] Patient: Sounds good, thank you.`,
  },

  // 3 — Type 2 diabetes follow-up, signed but not yet synced (OUTPATIENT, SIGNED)
  {
    patient: { firstName: 'Sofia', lastName: 'Reyes', mrn: 'MRN-900003', ageYears: 58, sex: 'F' },
    department: 'OUTPATIENT',
    chiefComplaint: 'Diabetes follow-up',
    disposition: Disposition.FOLLOW_UP,
    dispositionConfidence: 0.90,
    orderedLabs: ['HbA1c', 'CMP', 'Urine albumin/creatinine'],
    orderedImaging: [],
    daysAgo: 1,
    checkInHour: 14,
    waitMin: 12,
    examMin: 24,
    signMin: 8,
    syncSec: null,
    generationMs: 1130,
    syncLatencyMs: 0,
    note: {
      subjective:
        '58yo female presenting for routine follow-up of type 2 diabetes mellitus. Reports increased thirst and nocturia over the past month. Adherent to metformin but notes dietary lapses during recent travel. Home fasting glucose readings 160–190 mg/dL. Denies blurred vision or numbness/tingling. PMH: type 2 DM (8 years), hyperlipidemia. Meds: metformin 1000mg BID, atorvastatin 20mg.',
      objective:
        'VS: BP 128/80, HR 74, RR 14, O2Sat 99% on room air, Temp 98.4°F, BMI 31. No acute distress. Cardiac and pulmonary exams unremarkable. Feet: intact monofilament sensation bilaterally, no ulcers or deformities, pedal pulses 2+. HbA1c 8.4% (prior 7.6%). CMP: glucose 172, creatinine 0.9, eGFR > 60. Urine albumin-to-creatinine ratio within normal limits.',
      assessment:
        '1. Type 2 diabetes mellitus with suboptimal glycemic control — HbA1c uptrending to 8.4%.\n2. Hyperlipidemia, on statin therapy.\n3. Diabetic foot exam normal; no peripheral neuropathy on exam.',
      plan:
        '1. Add empagliflozin 10mg daily for glycemic control and cardiorenal benefit; counseled on euglycemic DKA and genital mycotic infection risk.\n2. Continue metformin 1000mg BID.\n3. Reinforce medical nutrition therapy; referral to diabetes educator placed.\n4. Repeat HbA1c in 3 months.\n5. Continue atorvastatin; annual diabetic eye exam and foot exam reinforced.',
    },
    codes: [
      { system: CodeSystem.ICD10CM, code: 'E11.65', description: 'Type 2 diabetes mellitus with hyperglycemia', confidence: 0.93 },
      { system: CodeSystem.ICD10CM, code: 'E78.5',  description: 'Hyperlipidemia, unspecified',                confidence: 0.85 },
      { system: CodeSystem.CPT,     code: '99214',  description: 'Office visit, moderate complexity',          confidence: 0.90 },
    ],
    transcript:
      `[00:00] Clinician: Hi Sofia, you're here for your diabetes follow-up. How have things been?\n` +
      `[00:08] Patient: My sugars have been running higher — 160 to 190 in the mornings. I traveled and didn't eat great.\n` +
      `[00:20] Clinician: Any vision changes or numbness in your feet?\n` +
      `[00:24] Patient: No, none of that.\n` +
      `[00:31] Clinician: Your A1c is up to 8.4. I'd like to add a second medication, empagliflozin, and get you with a diabetes educator.\n` +
      `[00:45] Patient: Okay, I'm willing to try that.`,
  },
]

// ---------------------------------------------------------------------------
// Seeder
// ---------------------------------------------------------------------------

export async function seedDatabase(prisma: PrismaClient): Promise<SeedSummary> {
  // Clear all data first, in FK-safe reverse order. Repeatable and safe.
  await prisma.ehrSyncLog.deleteMany()
  await prisma.codeSuggestion.deleteMany()
  await prisma.clinicalNote.deleteMany()
  await prisma.transcript.deleteMany()
  await prisma.encounter.deleteMany()
  await prisma.simulationRun.deleteMany()
  await prisma.patient.deleteMany()
  await prisma.user.deleteMany()

  // Users — one per role. Created sequentially to stay within the connection
  // limits of serverless Postgres (a wide Promise.all can exhaust them).
  const clinician = await prisma.user.create({
    data: { name: 'Dr. Sarah Chen', email: 'sarah.chen@clinicaltwin.dev', role: Role.CLINICIAN },
  })
  await prisma.user.create({
    data: { name: 'Marcus Williams', email: 'marcus.williams@clinicaltwin.dev', role: Role.OPS_DIRECTOR },
  })
  await prisma.user.create({
    data: { name: 'Dr. Priya Patel', email: 'priya.patel@clinicaltwin.dev', role: Role.CMIO },
  })

  // Patients — 30 with varied ages, realistic fictional names (sequential).
  const patients: Patient[] = []
  for (let i = 0; i < FIRST_NAMES.length; i++) {
    const ageYears = 19 + ((i * 3 + 11) % 65) // ages 19–83
    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - ageYears)
    dob.setMonth((i * 5) % 12)
    dob.setDate(1 + (i * 7) % 28)
    patients.push(
      await prisma.patient.create({
        data: {
          mrn:       `MRN-${String(100_001 + i).padStart(6, '0')}`,
          firstName: FIRST_NAMES[i],
          lastName:  LAST_NAMES[i],
          dob,
          sex:       i % 3 === 0 ? 'M' : i % 3 === 1 ? 'F' : 'M', // ~2:1 M:F
        },
      }),
    )
  }

  const summary: SeedSummary = {
    users:       3,
    patients:    patients.length,
    encounters:  0,
    transcripts: 0,
    notes:       0,
    codes:       0,
    syncLogs:    0,
  }

  // Encounters — 60 spread across 14 days
  for (let i = 0; i < ENCOUNTER_DAYS.length; i++) {
    const daysAgo   = ENCOUNTER_DAYS[i]
    const patient   = patients[i % patients.length]
    const complaint = CHIEF_COMPLAINTS[i % CHIEF_COMPLAINTS.length]
    const dept      = i % 5 < 2 ? 'ED' : 'OUTPATIENT' // ~40% ED, ~60% OUTPATIENT
    const labs      = LAB_PANELS[i % LAB_PANELS.length]
    const imaging   = IMAGING_SETS[i % IMAGING_SETS.length]
    const disp      = DISPOSITIONS[i % DISPOSITIONS.length]
    const dispConf  = parseFloat((0.60 + (i % 40) / 100).toFixed(2)) // 0.60–0.99
    const status    = deriveStatus(daysAgo, i)

    const checkInHour = daysAgo === 0 ? 7 + (i % 6) : 7 + (i % 12)
    const checkInAt   = atHour(daysAgo, checkInHour, i * 7 % 60)

    const waitMin = 10 + (i % 25) // wait to exam: 10–34 min
    const examMin = 10 + (i % 31) // exam duration: 10–40 min
    const signMin = 5 + (i % 30)  // sign delay after exam: 5–34 min
    const syncSec = 30 + (i % 90) // EHR sync delay: 30–119 s

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
    summary.encounters++

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
      summary.transcripts++
    }

    // Clinical note — present from SIGNED onward
    const hasNote = status === EncounterStatus.SIGNED || status === EncounterStatus.SYNCED
    if (hasNote && signedAt) {
      const ageYears = Math.floor(
        (Date.now() - patient.dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
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
          generationMs: 650 + (i % 2100), // 650–2750 ms
          editedFields: i % 4 === 0 ? ['plan']
                      : i % 4 === 1 ? ['assessment', 'plan']
                      : [],
          signedById: clinician.id,
          signedAt,
        },
      })
      summary.notes++

      for (const c of noteData.codes) {
        await prisma.codeSuggestion.create({
          data: {
            noteId:      note.id,
            system:      c.system,
            code:        c.code,
            description: c.description,
            confidence:  c.confidence,
            accepted:    i % 9 !== 0, // ~89% accepted
          },
        })
        summary.codes++
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
              { resource: { resourceType: 'Encounter', id: encounter.id, status: 'finished', subject: { reference: `Patient/${patient.id}` } } },
              { resource: { resourceType: 'Patient', id: patient.id, name: [{ family: patient.lastName, given: [patient.firstName] }], birthDate: patient.dob.toISOString().split('T')[0], gender: patient.sex === 'M' ? 'male' : 'female' } },
            ],
          },
          latencyMs: 120 + (i % 850), // 120–969 ms
          success:   true,
        },
      })
      summary.syncLogs++
    }
  }

  // -------------------------------------------------------------------------
  // Curated showcase encounters — clean, fully-signed, demo-ready
  // -------------------------------------------------------------------------
  for (let s = 0; s < SHOWCASE_ENCOUNTERS.length; s++) {
    const sc = SHOWCASE_ENCOUNTERS[s]
    const synced = sc.syncSec != null
    const finalStatus = synced ? EncounterStatus.SYNCED : EncounterStatus.SIGNED

    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - sc.patient.ageYears)
    dob.setMonth((s * 4) % 12)
    dob.setDate(2 + (s * 9) % 26)

    const patient = await prisma.patient.create({
      data: {
        mrn:       sc.patient.mrn,
        firstName: sc.patient.firstName,
        lastName:  sc.patient.lastName,
        dob,
        sex:       sc.patient.sex,
      },
    })
    summary.patients++

    const checkInAt   = atHour(sc.daysAgo, sc.checkInHour, (s * 13) % 60)
    const examStartAt = addMinutes(checkInAt, sc.waitMin)
    const examEndAt   = addMinutes(examStartAt, sc.examMin)
    const signedAt    = addMinutes(examEndAt, sc.signMin)
    const syncedAt    = synced ? addSeconds(signedAt, sc.syncSec as number) : undefined

    const encounter = await prisma.encounter.create({
      data: {
        patientId:             patient.id,
        clinicianId:           clinician.id,
        status:                finalStatus,
        department:            sc.department,
        chiefComplaint:        sc.chiefComplaint,
        checkInAt,
        examStartAt,
        examEndAt,
        signedAt,
        ...(syncedAt && { syncedAt }),
        predictedDisposition:  sc.disposition,
        dispositionConfidence: sc.dispositionConfidence,
        orderedLabs:           sc.orderedLabs,
        orderedImaging:        sc.orderedImaging,
      },
    })
    summary.encounters++

    await prisma.transcript.create({
      data: {
        encounterId:  encounter.id,
        rawText:      sc.transcript,
        durationSec:  150 + s * 30,
        audioDeleted: true,
      },
    })
    summary.transcripts++

    const note = await prisma.clinicalNote.create({
      data: {
        encounterId:  encounter.id,
        status:       NoteStatus.SIGNED,
        subjective:   sc.note.subjective,
        objective:    sc.note.objective,
        assessment:   sc.note.assessment,
        plan:         sc.note.plan,
        aiModel:      'claude-sonnet-4-6',
        generationMs: sc.generationMs,
        editedFields: [], // clean — signed without edits
        signedById:   clinician.id,
        signedAt,
      },
    })
    summary.notes++

    for (const c of sc.codes) {
      await prisma.codeSuggestion.create({
        data: {
          noteId:      note.id,
          system:      c.system,
          code:        c.code,
          description: c.description,
          confidence:  c.confidence,
          accepted:    true, // clinician accepted every suggestion
        },
      })
      summary.codes++
    }

    if (synced && syncedAt) {
      await prisma.ehrSyncLog.create({
        data: {
          encounterId: encounter.id,
          fhirBundle: {
            resourceType: 'Bundle',
            type:         'transaction',
            id:           `bundle-showcase-${s}`,
            timestamp:    syncedAt.toISOString(),
            entry: [
              { resource: { resourceType: 'Encounter', id: encounter.id, status: 'finished', subject: { reference: `Patient/${patient.id}` } } },
              { resource: { resourceType: 'Patient', id: patient.id, name: [{ family: patient.lastName, given: [patient.firstName] }], birthDate: patient.dob.toISOString().split('T')[0], gender: patient.sex === 'M' ? 'male' : 'female' } },
            ],
          },
          latencyMs: sc.syncLatencyMs,
          success:   true,
        },
      })
      summary.syncLogs++
    }
  }

  return summary
}
