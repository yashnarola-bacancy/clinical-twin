// Shared pill style: tinted bg + inset ring, matching the persona/demo chips
// in the header. Each *_CFG below only supplies the bg/text/ring color.
const BASE = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset'

const FALLBACK = 'bg-slate-50 text-slate-600 ring-slate-200'

// ---------------------------------------------------------------------------
// EncounterStatus badge
// ---------------------------------------------------------------------------

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  CHECKED_IN:      { label: 'Checked in',     cls: 'bg-slate-50 text-slate-600 ring-slate-200'    },
  IN_EXAM:         { label: 'In exam',        cls: 'bg-blue-50 text-blue-700 ring-blue-200'        },
  AWAITING_REVIEW: { label: 'Awaiting review', cls: 'bg-amber-50 text-amber-700 ring-amber-200'    },
  SIGNED:          { label: 'Signed',         cls: 'bg-green-50 text-green-700 ring-green-200'      },
  SYNCED:          { label: 'Synced',         cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, cls: FALLBACK }
  return <span className={`${BASE} ${cfg.cls}`}>{cfg.label}</span>
}

// ---------------------------------------------------------------------------
// Department badge
// ---------------------------------------------------------------------------

const DEPT_CFG: Record<string, string> = {
  ED:         'bg-red-50 text-red-700 ring-red-200',
  OUTPATIENT: 'bg-sky-50 text-sky-700 ring-sky-200',
}

export function DeptBadge({ dept }: { dept: string }) {
  const cls = DEPT_CFG[dept] ?? FALLBACK
  return <span className={`${BASE} ${cls}`}>{dept}</span>
}

// ---------------------------------------------------------------------------
// NoteStatus badge (used in detail page)
// ---------------------------------------------------------------------------

const NOTE_CFG: Record<string, string> = {
  DRAFT:  'bg-slate-50 text-slate-600 ring-slate-200',
  EDITED: 'bg-amber-50 text-amber-700 ring-amber-200',
  SIGNED: 'bg-green-50 text-green-700 ring-green-200',
}

export function NoteStatusBadge({ status }: { status: string }) {
  const cls = NOTE_CFG[status] ?? FALLBACK
  const label = status.charAt(0) + status.slice(1).toLowerCase()
  return <span className={`${BASE} ${cls}`}>{label}</span>
}
