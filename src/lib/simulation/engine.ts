import type {
  SimConfig,
  Patient,
  SimResults,
  HourlyTimelinePoint,
} from './types'

// ---------------------------------------------------------------------------
// Clinical twin — discrete-event simulation engine
//
// runSimulation() is a PURE function: every source of state and randomness is
// passed in (config + patients), so the same inputs always yield the same
// SimResults. It touches no database, network, clock, or Math.random — which
// makes it trivially unit-testable and reproducible.
//
// Model overview
// --------------
// Patients arrive at the times baked into the `patients` array and flow through:
//
//   TRIAGE (nurse) → [wait for bed] → EXAM (doctor) → optional LABS → DISPOSITION
//
// A bed is acquired once triage finishes and is held for the entire treatment
// (exam + labs + disposition), plus an extra boarding hold for admitted
// patients (they occupy a bed while waiting for an inpatient placement). Nurses,
// doctors, and beds are finite; when none are free the patient joins a FIFO
// queue and accrues wait time. Lab turnaround is modelled as a pure delay (it
// consumes a bed but no staffed resource).
//
// Nursing note: ED and outpatient nurses are SEPARATE staffing pools. A patient
// is triaged by the nurse pool for their department (Patient.department), so
// reallocating nurses between the lines genuinely shifts where the queue forms.
// Doctors and beds are shared facility-wide.
// ---------------------------------------------------------------------------

// --- Fixed service times (minutes) -----------------------------------------
// These stages have no per-patient variability in the input model, so they use
// plausible constants. Per-patient variation lives in arrival times, exam
// durations, and lab/admission flags supplied by the patient generator.

/** Nurse-led triage / intake. */
const TRIAGE_MIN = 5
/** Diagnostic turnaround once labs are ordered. */
const LAB_TURNAROUND_MIN = 30
/** Extra time an admitted patient holds a bed waiting for an inpatient placement. */
const ADMIT_BOARDING_MIN = 120

const ADMIT_DISPOSITIONS = new Set(['ADMIT_WARD', 'ADMIT_ICU'])

// ---------------------------------------------------------------------------
// Internal scheduling primitives
// ---------------------------------------------------------------------------

/** One item in the future-event list. `seq` breaks ties so order is deterministic. */
interface ScheduledEvent {
  time: number
  seq: number
  run: () => void
}

/** Binary min-heap keyed by (time, seq) — the simulation's future-event list. */
class EventQueue {
  private heap: ScheduledEvent[] = []

  get size(): number {
    return this.heap.length
  }

  push(ev: ScheduledEvent): void {
    const h = this.heap
    h.push(ev)
    let i = h.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!this.less(h[i], h[parent])) break
      ;[h[i], h[parent]] = [h[parent], h[i]]
      i = parent
    }
  }

  pop(): ScheduledEvent | undefined {
    const h = this.heap
    if (h.length === 0) return undefined
    const top = h[0]
    const last = h.pop()!
    if (h.length > 0) {
      h[0] = last
      this.siftDown(0)
    }
    return top
  }

  private siftDown(i: number): void {
    const h = this.heap
    const n = h.length
    for (;;) {
      const l = 2 * i + 1
      const r = 2 * i + 2
      let smallest = i
      if (l < n && this.less(h[l], h[smallest])) smallest = l
      if (r < n && this.less(h[r], h[smallest])) smallest = r
      if (smallest === i) break
      ;[h[i], h[smallest]] = [h[smallest], h[i]]
      i = smallest
    }
  }

  private less(a: ScheduledEvent, b: ScheduledEvent): boolean {
    return a.time !== b.time ? a.time < b.time : a.seq < b.seq
  }
}

/** A patient waiting in line for a busy resource. */
interface Waiter {
  patientId: string
  since: number
  onAcquired: (now: number) => void
}

/** A finite resource (nurse pool, doctors, or beds) with a FIFO wait queue. */
interface Resource {
  capacity: number
  available: number
  queue: Waiter[]
}

function makeResource(capacity: number): Resource {
  // Guard against a zero/negative capacity starving the sim forever.
  const cap = Math.max(1, Math.floor(capacity))
  return { capacity: cap, available: cap, queue: [] }
}

// ---------------------------------------------------------------------------
// runSimulation
// ---------------------------------------------------------------------------

export function runSimulation(config: SimConfig, patients: Patient[]): SimResults {
  const simEndMin = Math.max(0, config.simDurationHours) * 60
  const hours = Math.max(1, Math.ceil(config.simDurationHours))

  // Resources. ED and outpatient nurses are separate pools (see header note);
  // doctors and beds are shared facility-wide.
  const edNurses = makeResource(config.edNurses)
  const outpatientNurses = makeResource(config.outpatientNurses)
  const doctors = makeResource(config.doctors)
  const beds = makeResource(config.beds)

  const queue = new EventQueue()
  let seq = 0
  const schedule = (time: number, run: () => void) =>
    queue.push({ time, seq: seq++, run })

  // --- Metrics state --------------------------------------------------------
  const totalWait = new Map<string, number>() // per-patient cumulative queue wait
  for (const p of patients) totalWait.set(p.id, 0)
  const addWait = (id: string, w: number) =>
    totalWait.set(id, (totalWait.get(id) ?? 0) + w)

  let waiting = 0 // patients currently queued across ALL resources
  let maxQueueLength = 0
  let throughput = 0 // patients who departed within the sim window

  // Bed utilisation via time integration: area under the beds-in-use curve.
  let bedBusyArea = 0
  let lastBedTime = 0
  const updateBedArea = (now: number) => {
    const end = Math.min(now, simEndMin)
    if (end > lastBedTime) {
      const inUse = beds.capacity - beds.available
      bedBusyArea += inUse * (end - lastBedTime)
      lastBedTime = end
    }
  }

  // Hourly snapshots, sampled at each hour boundary.
  const snapQueue = new Array<number>(hours).fill(0)
  const snapBeds = new Array<number>(hours).fill(0)

  // --- Resource acquire / release ------------------------------------------
  // Beds change occupancy only when `available` changes; a direct hand-off to a
  // waiter keeps occupancy constant, so we only integrate bed area there.

  const acquire = (
    res: Resource,
    patientId: string,
    now: number,
    onAcquired: (now: number) => void,
  ) => {
    if (res.available > 0) {
      if (res === beds) updateBedArea(now)
      res.available--
      onAcquired(now) // served immediately — zero wait
    } else {
      res.queue.push({ patientId, since: now, onAcquired })
      waiting++
      if (waiting > maxQueueLength) maxQueueLength = waiting
    }
  }

  const release = (res: Resource, now: number) => {
    const next = res.queue.shift()
    if (next) {
      waiting--
      addWait(next.patientId, now - next.since)
      next.onAcquired(now) // hand the unit straight to the next in line
    } else {
      if (res === beds) updateBedArea(now)
      res.available++
    }
  }

  // --- Patient pathway (a chain of scheduled continuations) -----------------

  const arrive = (p: Patient) => {
    // Triage is handled by the nurse pool for the patient's service line.
    const nurses = p.department === 'ED' ? edNurses : outpatientNurses
    acquire(nurses, p.id, p.arrivalTime, (start) => {
      // TRIAGE
      schedule(start + TRIAGE_MIN, () => {
        release(nurses, start + TRIAGE_MIN)
        acquireBed(p, start + TRIAGE_MIN)
      })
    })
  }

  const acquireBed = (p: Patient, t: number) => {
    // The bed is held from here until the patient departs.
    acquire(beds, p.id, t, (bedStart) => exam(p, bedStart))
  }

  const exam = (p: Patient, t: number) => {
    acquire(doctors, p.id, t, (start) => {
      // EXAM — the only stage whose duration varies per patient.
      const done = start + Math.max(1, p.examDuration)
      schedule(done, () => {
        release(doctors, done)
        if (p.requiredStages.includes('LABS')) labs(p, done)
        else disposition(p, done)
      })
    })
  }

  const labs = (p: Patient, t: number) => {
    // Pure delay: occupies the bed but no staffed resource.
    schedule(t + LAB_TURNAROUND_MIN, () => disposition(p, t + LAB_TURNAROUND_MIN))
  }

  const disposition = (p: Patient, t: number) => {
    // Admitted patients board (hold the bed) until an inpatient bed frees up.
    const admitted = p.disposition ? ADMIT_DISPOSITIONS.has(p.disposition) : false
    const departAt = t + (admitted ? ADMIT_BOARDING_MIN : 0)
    schedule(departAt, () => {
      release(beds, departAt)
      if (departAt <= simEndMin) throughput++
    })
  }

  // --- Seed the event queue -------------------------------------------------
  for (let h = 0; h < hours; h++) {
    schedule(h * 60, () => {
      snapQueue[h] = waiting
      snapBeds[h] = beds.capacity - beds.available
    })
  }
  for (const p of patients) schedule(p.arrivalTime, () => arrive(p))

  // --- Run ------------------------------------------------------------------
  for (let ev = queue.pop(); ev; ev = queue.pop()) {
    ev.run()
  }
  updateBedArea(simEndMin) // close out the final occupancy segment

  // --- Aggregate results ----------------------------------------------------
  const waits = patients.map((p) => totalWait.get(p.id) ?? 0)

  // avgWait per hour is bucketed by the patient's arrival hour: "if you showed
  // up this hour, how long did you spend waiting in total?"
  const hourWaitSum = new Array<number>(hours).fill(0)
  const hourWaitCount = new Array<number>(hours).fill(0)
  patients.forEach((p, i) => {
    const h = Math.floor(p.arrivalTime / 60)
    if (h >= 0 && h < hours) {
      hourWaitSum[h] += waits[i]
      hourWaitCount[h]++
    }
  })

  const hourlyTimeline: HourlyTimelinePoint[] = []
  for (let h = 0; h < hours; h++) {
    hourlyTimeline.push({
      hour: h,
      avgWait: hourWaitCount[h] ? round1(hourWaitSum[h] / hourWaitCount[h]) : 0,
      queueLength: snapQueue[h],
      bedsInUse: snapBeds[h],
    })
  }

  const bedDenominator = beds.capacity * simEndMin

  return {
    avgWaitMin: round1(mean(waits)),
    p90WaitMin: round1(percentile(waits, 0.9)),
    maxQueueLength,
    bedUtilizationPct: bedDenominator > 0 ? round1((bedBusyArea / bedDenominator) * 100) : 0,
    throughput,
    hourlyTimeline,
  }
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let sum = 0
  for (const x of xs) sum += x
  return sum / xs.length
}

/** Nearest-rank percentile (q in [0, 1]). */
function percentile(xs: number[], q: number): number {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  return sorted[idx]
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}
