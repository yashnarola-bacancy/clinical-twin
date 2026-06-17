'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { seedDatabase, type SeedSummary } from '@/lib/seed'

export type ReseedResult =
  | { ok: true; data: SeedSummary }
  | { ok: false; error: string }

// Clears ALL data and regenerates fresh synthetic demo data. Destructive by
// design — the UI gates this behind an explicit confirmation step.
export async function reseedDatabase(): Promise<ReseedResult> {
  try {
    const summary = await seedDatabase(db)
    // Refresh every route that reads from the DB (dashboard, encounters, twin…).
    revalidatePath('/', 'layout')
    return { ok: true, data: summary }
  } catch (err) {
    console.error('Re-seed failed:', err)
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'The database could not be reset. Check the server logs and the database connection.',
    }
  }
}
