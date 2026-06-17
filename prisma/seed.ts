import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { seedDatabase } from '../src/lib/seed'

// Thin CLI wrapper around the shared seeder in src/lib/seed.ts. The same logic
// is reused by the in-app /settings re-seed action (which uses the db singleton).
const prisma = new PrismaClient()

async function main() {
  console.log('⟳  Clearing existing data and reseeding…')
  const s = await seedDatabase(prisma)

  console.log('\n✓  Seed complete')
  console.log(`   Users:            ${s.users}`)
  console.log(`   Patients:         ${s.patients}`)
  console.log(`   Encounters:       ${s.encounters}`)
  console.log(`   Transcripts:      ${s.transcripts}`)
  console.log(`   Clinical notes:   ${s.notes}`)
  console.log(`   Code suggestions: ${s.codes}`)
  console.log(`   EHR sync logs:    ${s.syncLogs}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
