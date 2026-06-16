// Simulation engine property tests. No test framework — just assertions.
// Run with:  npx tsx src/lib/simulation/engine.test.ts
//
// Proves four invariants of runSimulation():
//   1. more nurses        → lower average wait (all else equal)
//   2. higher arrival rate → longer queues
//   3. same seed          → identical results (deterministic & pure)
//   4. bed utilization     → always within [0, 100]%
import { runSimulation } from './engine'
import { generatePatients } from './generatePatients'
import type { SimConfig } from './types'

// ---------------------------------------------------------------------------
// Tiny assertion harness
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ''}`)
  }
}

const BASE: SimConfig = {
  edNurses: 3,
  outpatientNurses: 2,
  doctors: 3,
  beds: 12,
  arrivalRatePerHour: 8,
  simDurationHours: 12,
}

// ---------------------------------------------------------------------------
// 1. More nurses → lower average wait, all else equal.
//    Keep the SAME patients and make staff (not beds/doctors) the bottleneck
//    by giving generous beds/doctors but a heavy arrival stream.
// ---------------------------------------------------------------------------

console.log('1) more nurses → lower average wait')
{
  const cfg: SimConfig = {
    ...BASE,
    doctors: 20,
    beds: 60,
    arrivalRatePerHour: 24,
    simDurationHours: 12,
  }
  const patients = generatePatients(cfg, 101)

  const understaffed = runSimulation({ ...cfg, edNurses: 1, outpatientNurses: 0 }, patients)
  const wellStaffed = runSimulation({ ...cfg, edNurses: 8, outpatientNurses: 4 }, patients)

  check(
    'avg wait drops when nurses increase',
    wellStaffed.avgWaitMin < understaffed.avgWaitMin,
    `understaffed=${understaffed.avgWaitMin} wellStaffed=${wellStaffed.avgWaitMin}`,
  )
}

// ---------------------------------------------------------------------------
// 2. Higher arrival rate → longer queues.
//    Hold resources fixed; only the arrival rate changes.
// ---------------------------------------------------------------------------

console.log('2) higher arrival rate → longer queues')
{
  const fixed = { ...BASE, edNurses: 2, outpatientNurses: 1, doctors: 2, beds: 6 }

  const lowRate = { ...fixed, arrivalRatePerHour: 4 }
  const highRate = { ...fixed, arrivalRatePerHour: 16 }

  const low = runSimulation(lowRate, generatePatients(lowRate, 202))
  const high = runSimulation(highRate, generatePatients(highRate, 202))

  check(
    'max queue grows with arrival rate',
    high.maxQueueLength > low.maxQueueLength,
    `low=${low.maxQueueLength} high=${high.maxQueueLength}`,
  )
}

// ---------------------------------------------------------------------------
// 3. Deterministic for the same seed.
//    Same seed → identical patients AND identical results, run twice.
// ---------------------------------------------------------------------------

console.log('3) same seed → identical results')
{
  const p1 = generatePatients(BASE, 303)
  const p2 = generatePatients(BASE, 303)
  check('patient generation is reproducible', JSON.stringify(p1) === JSON.stringify(p2))

  const r1 = runSimulation(BASE, p1)
  const r2 = runSimulation(BASE, p2)
  check(
    'simulation results are identical',
    JSON.stringify(r1) === JSON.stringify(r2),
    `r1.avg=${r1.avgWaitMin} r2.avg=${r2.avgWaitMin}`,
  )
}

// ---------------------------------------------------------------------------
// 4. Bed utilization is always within [0, 100]%.
//    Sweep from idle to heavily overloaded; the percentage must never break out.
// ---------------------------------------------------------------------------

console.log('4) bed utilization stays within [0, 100]%')
{
  const scenarios: SimConfig[] = [
    { ...BASE, arrivalRatePerHour: 1, beds: 30 }, // nearly idle
    BASE, // baseline
    { ...BASE, arrivalRatePerHour: 20, beds: 4 }, // overloaded
    { ...BASE, arrivalRatePerHour: 40, beds: 2, doctors: 1 }, // severely overloaded
  ]

  let allInRange = true
  let worst = ''
  for (let i = 0; i < scenarios.length; i++) {
    const cfg = scenarios[i]
    const r = runSimulation(cfg, generatePatients(cfg, 400 + i))
    const ok = r.bedUtilizationPct >= 0 && r.bedUtilizationPct <= 100
    if (!ok) {
      allInRange = false
      worst = `scenario ${i}: ${r.bedUtilizationPct}%`
    }
  }
  check('utilization never exceeds 100% (nor goes negative)', allInRange, worst)
}

// ---------------------------------------------------------------------------
// 5. Reallocating nurses to the constrained service line lowers wait.
//    The PRD example: ED is nurse-bound while outpatient has slack; moving
//    nurses from outpatient → ED should cut the average wait. Same patients.
// ---------------------------------------------------------------------------

console.log('5) move nurses to the constrained line (ED) → lower wait')
{
  const cfg: SimConfig = {
    ...BASE,
    doctors: 20,
    beds: 60,
    arrivalRatePerHour: 28,
    simDurationHours: 12,
  };
  const patients = generatePatients(cfg, 505);

  // Baseline: ED starved (1 nurse), outpatient flush (8).
  const before = runSimulation({ ...cfg, edNurses: 1, outpatientNurses: 8 }, patients);
  // Move 3 nurses outpatient → ED.
  const after = runSimulation({ ...cfg, edNurses: 4, outpatientNurses: 5 }, patients);

  check(
    'avg wait drops when nurses move to the bound (ED) line',
    after.avgWaitMin < before.avgWaitMin,
    `before=${before.avgWaitMin} after=${after.avgWaitMin}`,
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
