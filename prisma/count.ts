import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

async function main() {
  const [users, patients, encounters, transcripts, notes, codes, ehrLogs, sims] =
    await Promise.all([
      p.user.count(),
      p.patient.count(),
      p.encounter.count(),
      p.transcript.count(),
      p.clinicalNote.count(),
      p.codeSuggestion.count(),
      p.ehrSyncLog.count(),
      p.simulationRun.count(),
    ])

  console.log('Table row counts:')
  console.log(`  User:           ${users}`)
  console.log(`  Patient:        ${patients}`)
  console.log(`  Encounter:      ${encounters}`)
  console.log(`  Transcript:     ${transcripts}`)
  console.log(`  ClinicalNote:   ${notes}`)
  console.log(`  CodeSuggestion: ${codes}`)
  console.log(`  EhrSyncLog:     ${ehrLogs}`)
  console.log(`  SimulationRun:  ${sims}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
