import { format, isToday, isYesterday } from 'date-fns'

// ---------------------------------------------------------------------------
// Date / time formatting
// ---------------------------------------------------------------------------

/** "Today · 9:14 AM"  |  "Yesterday · 2:30 PM"  |  "Jun 13 · 2:30 PM" */
export function fmtCheckIn(date: Date): string {
  const time = format(date, 'h:mm a')
  if (isToday(date))     return `Today · ${time}`
  if (isYesterday(date)) return `Yesterday · ${time}`
  return `${format(date, 'MMM d')} · ${time}`
}

/** "Jun 14 · 9:14 AM" */
export function fmtTime(date: Date): string {
  return format(date, 'MMM d · h:mm a')
}

/** "Jun 14, 2026 · 9:14 AM" */
export function fmtDatetime(date: Date): string {
  return format(date, 'MMM d, yyyy · h:mm a')
}

/** Signed difference in whole minutes (positive = b after a). */
export function diffMin(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000)
}

/** Age in full years from date-of-birth. */
export function ageFromDob(dob: Date): number {
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age
}

// ---------------------------------------------------------------------------
// Domain label maps (shared between list and detail)
// ---------------------------------------------------------------------------

export const DISPOSITION_LABELS: Record<string, string> = {
  DISCHARGE:  'Discharge',
  ADMIT_WARD: 'Admit Ward',
  ADMIT_ICU:  'Admit ICU',
  REFERRAL:   'Referral',
  FOLLOW_UP:  'Follow-up',
}

export const CODE_SYSTEM_LABELS: Record<string, string> = {
  ICD10CM:  'ICD-10',
  CPT:      'CPT',
  SNOMEDCT: 'SNOMED',
}
