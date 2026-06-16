// ---------------------------------------------------------------------------
// Clinical twin — discrete-event simulation types
//
// Types only; no simulation logic lives here. The engine consumes a SimConfig,
// streams SimEvents while advancing the clock, and produces a SimResults.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Input configuration
// ---------------------------------------------------------------------------

/** Knobs the user dials in before a run. */
export interface SimConfig {
  /** Nurses staffing the emergency department. */
  edNurses: number
  /** Nurses staffing outpatient flow. */
  outpatientNurses: number
  /** Physicians available across the facility. */
  doctors: number
  /** Total physical beds. */
  beds: number
  /** Mean patient arrivals per hour (drives the arrival process). */
  arrivalRatePerHour: number
  /** How long to run the simulated clock, in hours. */
  simDurationHours: number
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

/** A care step a patient must pass through, in order. */
export type CareStage =
  | 'TRIAGE'      // nurse-led intake / acuity assessment
  | 'EXAM'        // physician examination
  | 'LABS'        // optional diagnostics turnaround
  | 'DISPOSITION' // discharge / admit decision

/**
 * Service line a patient flows through. Each line has its own nursing staff
 * (edNurses vs outpatientNurses); doctors and beds are shared facility-wide.
 */
export type Department = 'ED' | 'OUTPATIENT'

/** Where a patient ends up once care concludes. */
export type Disposition =
  | 'DISCHARGE'
  | 'ADMIT_WARD'
  | 'ADMIT_ICU'
  | 'REFERRAL'
  | 'FOLLOW_UP'

/** A single simulated patient and their journey requirements. */
export interface Patient {
  /** Stable identifier within a run. */
  id: string
  /** Service line — determines which nurse pool handles triage. */
  department: Department
  /** Minutes from the start of the run when the patient arrives. */
  arrivalTime: number
  /** Ordered stages this patient must complete. */
  requiredStages: CareStage[]
  /** Minutes the doctor exam is expected to take. */
  examDuration: number
  /** Outcome assigned when care completes (undefined until resolved). */
  disposition?: Disposition
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** The kinds of state transitions the engine emits as the clock advances. */
export type SimEventType =
  | 'ARRIVAL'
  | 'STAGE_START'
  | 'STAGE_END'
  | 'BED_ACQUIRED'
  | 'BED_RELEASED'
  | 'DISPOSITION'
  | 'DEPARTURE'

/** A timestamped record of something that happened during the run. */
export interface SimEvent {
  /** Discriminator for the event variety. */
  type: SimEventType
  /** Minutes from the start of the run when the event occurred. */
  time: number
  /** Patient this event concerns. */
  patientId: string
  /** Care stage involved, for stage-scoped events. */
  stage?: CareStage
  /** Disposition assigned, for DISPOSITION events. */
  disposition?: Disposition
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** A per-hour snapshot of the system for charting the run over time. */
export interface HourlyTimelinePoint {
  /** Hour index from the start of the run (0-based). */
  hour: number
  /** Average wait in minutes for patients active this hour. */
  avgWait: number
  /** Number of patients waiting at the hour boundary. */
  queueLength: number
  /** Beds occupied at the hour boundary. */
  bedsInUse: number
}

/** Aggregate metrics produced after a completed run. */
export interface SimResults {
  /** Mean patient wait time, in minutes. */
  avgWaitMin: number
  /** 90th-percentile wait time, in minutes. */
  p90WaitMin: number
  /** Longest queue length observed during the run. */
  maxQueueLength: number
  /** Bed utilization over the run, as a percentage (0–100). */
  bedUtilizationPct: number
  /** Total patients that completed care. */
  throughput: number
  /** Hour-by-hour timeline of the run. */
  hourlyTimeline: HourlyTimelinePoint[]
}
