import type { SimConfig, Patient, CareStage, Disposition, Department } from './types'

// ---------------------------------------------------------------------------
// Clinical twin — synthetic patient generator
//
// generatePatients() is PURE and reproducible: given the same config and seed
// it always returns the same patient list. All randomness comes from a seeded
// RNG (mulberry32) — no Math.random, no Date. The output is clearly fictional
// flow data (no names, MRNs, or real clinical text), suitable for driving the
// simulation engine.
//
// Patients arrive as a Poisson process (exponential inter-arrival gaps) and are
// split across three acuity classes with plausible exam times, lab-order rates,
// and admission rates for a mixed ED / outpatient clinic.
// ---------------------------------------------------------------------------

/** A clinical acuity class with its own service profile. */
interface AcuityClass {
  /** Share of arrivals in this class (the three weights sum to 1). */
  weight: number
  /** Exam duration is sampled uniformly from [examMin, examMax] minutes. */
  examMin: number
  examMax: number
  /** Probability the patient needs diagnostics (adds a LABS stage). */
  labProb: number
  /** Probability the patient is admitted rather than discharged. */
  admitProb: number
  /** Of admitted patients, the share routed to ICU (rest go to a ward). */
  icuShareOfAdmits: number
  /** Service line this acuity class flows through (drives nurse routing). */
  department: Department
}

// Tuned to feel like a real mixed-acuity clinic: most walk-ins are routine and
// quick, a meaningful slice are urgent, and a small tail are critical, long, and
// likely to be admitted. Routine visits flow through the outpatient line; the
// urgent + critical tail flows through the ED (~40% of arrivals).
const ACUITY_CLASSES: AcuityClass[] = [
  // Routine / outpatient-style visits.
  { weight: 0.6, examMin: 10, examMax: 25, labProb: 0.2, admitProb: 0.02, icuShareOfAdmits: 0.0, department: 'OUTPATIENT' },
  // Urgent ED visits.
  { weight: 0.3, examMin: 20, examMax: 45, labProb: 0.55, admitProb: 0.25, icuShareOfAdmits: 0.15, department: 'ED' },
  // Critical / high-acuity ED visits.
  { weight: 0.1, examMin: 30, examMax: 70, labProb: 0.85, admitProb: 0.6, icuShareOfAdmits: 0.5, department: 'ED' },
]

// Non-admission outcomes and their relative weights.
const NON_ADMIT: Array<{ disposition: Disposition; weight: number }> = [
  { disposition: 'DISCHARGE', weight: 0.8 },
  { disposition: 'FOLLOW_UP', weight: 0.13 },
  { disposition: 'REFERRAL', weight: 0.07 },
]

/**
 * Real-world signal pulled from signed encounters, used to calibrate the
 * otherwise-synthetic generator toward the clinic's actual behaviour. All
 * fields optional — anything omitted falls back to the built-in defaults.
 */
export interface PatientCalibration {
  /**
   * Observed exam durations (minutes) from signed encounters. When present and
   * non-empty, exam times are resampled from this empirical pool instead of the
   * per-acuity ranges.
   */
  examDurationsMin?: number[]
  /**
   * Observed admission rate (0..1) across signed encounters. When provided, it
   * overrides the per-acuity admission probabilities.
   */
  admitRate?: number
}

/**
 * Generate a reproducible list of synthetic patients for a simulation run.
 *
 * @param config      Drives arrival rate (`arrivalRatePerHour`) and window (`simDurationHours`).
 * @param seed        Any integer; the same seed reproduces the same patients exactly.
 * @param calibration Optional real-world timing/admission data to calibrate against.
 */
export function generatePatients(
  config: SimConfig,
  seed: number,
  calibration?: PatientCalibration,
): Patient[] {
  const rng = mulberry32(seed)
  const patients: Patient[] = []

  const horizonMin = Math.max(0, config.simDurationHours) * 60
  const rate = Math.max(0, config.arrivalRatePerHour)
  if (horizonMin === 0 || rate === 0) return patients

  // Calibration inputs (validated): only use a positive, non-empty exam pool and
  // an admission rate that is a real fraction.
  const examPool = (calibration?.examDurationsMin ?? []).filter((d) => d > 0)
  const admitOverride =
    calibration?.admitRate != null && calibration.admitRate >= 0 && calibration.admitRate <= 1
      ? calibration.admitRate
      : undefined

  // Mean gap between arrivals (minutes) for a Poisson process at `rate`/hour.
  const meanGapMin = 60 / rate

  let clock = 0
  let i = 0
  for (;;) {
    // Exponential inter-arrival time: -mean * ln(U).
    clock += -meanGapMin * Math.log(1 - rng())
    if (clock >= horizonMin) break

    const cls = pickAcuity(rng)
    // Exam duration: empirical sample if calibrated, else the acuity-class range.
    const examDuration = examPool.length
      ? Math.max(1, Math.round(examPool[Math.floor(rng() * examPool.length)]))
      : Math.round(uniform(rng, cls.examMin, cls.examMax))
    const needsLabs = rng() < cls.labProb
    const admitProb = admitOverride ?? cls.admitProb
    const disposition = pickDisposition(rng, admitProb, cls.icuShareOfAdmits)

    const requiredStages: CareStage[] = ['TRIAGE', 'EXAM']
    if (needsLabs) requiredStages.push('LABS')
    requiredStages.push('DISPOSITION')

    patients.push({
      id: `SIM-${String(i + 1).padStart(4, '0')}`, // clearly synthetic id
      department: cls.department,
      arrivalTime: round1(clock),
      requiredStages,
      examDuration,
      disposition,
    })
    i++
  }

  return patients
}

// ---------------------------------------------------------------------------
// Sampling helpers
// ---------------------------------------------------------------------------

function pickAcuity(rng: () => number): AcuityClass {
  let r = rng()
  for (const cls of ACUITY_CLASSES) {
    if (r < cls.weight) return cls
    r -= cls.weight
  }
  return ACUITY_CLASSES[ACUITY_CLASSES.length - 1] // float-rounding fallback
}

function pickDisposition(rng: () => number, admitProb: number, icuShare: number): Disposition {
  if (rng() < admitProb) {
    return rng() < icuShare ? 'ADMIT_ICU' : 'ADMIT_WARD'
  }
  const total = NON_ADMIT.reduce((s, o) => s + o.weight, 0)
  let r = rng() * total
  for (const o of NON_ADMIT) {
    if (r < o.weight) return o.disposition
    r -= o.weight
  }
  return 'DISCHARGE'
}

function uniform(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng()
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

// ---------------------------------------------------------------------------
// Seeded RNG — mulberry32: tiny, fast, deterministic, good enough for a demo.
// Returns a float in [0, 1).
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
