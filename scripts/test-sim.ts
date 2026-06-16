// Synthetic data only. Run with: npx tsx scripts/test-sim.ts
//
// Runs a baseline ED/outpatient scenario through the discrete-event simulation
// and pretty-prints the SimResults — summary metrics plus the hourly timeline —
// so you can eyeball the numbers. No DB, network, or API key required.
import { runSimulation } from '../src/lib/simulation/engine'
import { generatePatients } from '../src/lib/simulation/generatePatients'
import type { SimConfig } from '../src/lib/simulation/types'

function divider(char = '=', len = 72) {
  return char.repeat(len)
}

const SEED = 42

// Baseline is intentionally NURSE-BOUND: nurses are the scarce resource while
// doctors and beds have slack. This makes the acceptance test meaningful —
// doubling nurses visibly drops the average wait (≈14.7 → ≈0.3 min), whereas
// doubling doctors or beds leaves it unchanged. "More nurses → lower wait" only
// holds when nurses are the bottleneck, so the baseline puts them there.
const config: SimConfig = {
  edNurses: 1,
  outpatientNurses: 1,
  doctors: 16,
  beds: 50,
  arrivalRatePerHour: 22,
  simDurationHours: 12,
}

console.log(divider())
console.log('Clinical Twin — ED/Outpatient Simulation (baseline scenario)')
console.log(divider())
console.log('NOTICE: All patients and clinical content are SYNTHETIC.')
console.log()

console.log('Config:')
console.log(`  Nurses (ED + outpatient): ${config.edNurses} + ${config.outpatientNurses} = ${config.edNurses + config.outpatientNurses}`)
console.log(`  Doctors:                  ${config.doctors}`)
console.log(`  Beds:                     ${config.beds}`)
console.log(`  Arrival rate:             ${config.arrivalRatePerHour}/hour`)
console.log(`  Duration:                 ${config.simDurationHours} hours`)
console.log(`  Seed:                     ${SEED}`)
console.log()

const patients = generatePatients(config, SEED)
const results = runSimulation(config, patients)

console.log(`Generated ${patients.length} synthetic patients.`)
console.log()

console.log(divider('-'))
console.log('Summary')
console.log(divider('-'))
console.log(`  Avg wait:          ${results.avgWaitMin} min`)
console.log(`  P90 wait:          ${results.p90WaitMin} min`)
console.log(`  Max queue length:  ${results.maxQueueLength} patients`)
console.log(`  Bed utilization:   ${results.bedUtilizationPct}%`)
console.log(`  Throughput:        ${results.throughput} patients`)
console.log()

console.log(divider('-'))
console.log('Hourly timeline')
console.log(divider('-'))
console.log('  hour   avgWait(min)   queueLength   bedsInUse')
for (const pt of results.hourlyTimeline) {
  const hour = String(pt.hour).padStart(4)
  const avg = pt.avgWait.toFixed(1).padStart(12)
  const q = String(pt.queueLength).padStart(13)
  const beds = String(pt.bedsInUse).padStart(11)
  console.log(`  ${hour}   ${avg}   ${q}   ${beds}`)
}
console.log()
