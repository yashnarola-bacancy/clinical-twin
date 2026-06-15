const BASE = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'

// ---------------------------------------------------------------------------
// EncounterStatus badge
// ---------------------------------------------------------------------------

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  CHECKED_IN:      { label: 'Checked in',      cls: 'bg-slate-100 text-slate-600'   },
  IN_EXAM:         { label: 'In exam',          cls: 'bg-blue-100 text-blue-700'     },
  AWAITING_REVIEW: { label: 'Awaiting review',  cls: 'bg-amber-100 text-amber-700'   },
  SIGNED:          { label: 'Signed',           cls: 'bg-green-100 text-green-700'   },
  SYNCED:          { label: 'Synced',           cls: 'bg-emerald-100 text-emerald-700' },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' }
  return <span className={`${BASE} ${cfg.cls}`}>{cfg.label}</span>
}

// ---------------------------------------------------------------------------
// Department badge
// ---------------------------------------------------------------------------

const DEPT_CFG: Record<string, string> = {
  ED:         'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  OUTPATIENT: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200',
}

export function DeptBadge({ dept }: { dept: string }) {
  const cls = DEPT_CFG[dept] ?? 'bg-slate-100 text-slate-600'
  return <span className={`${BASE} ${cls}`}>{dept}</span>
}

// ---------------------------------------------------------------------------
// NoteStatus badge (used in detail page)
// ---------------------------------------------------------------------------

const NOTE_CFG: Record<string, string> = {
  DRAFT:  'bg-slate-100 text-slate-600',
  EDITED: 'bg-amber-100 text-amber-700',
  SIGNED: 'bg-green-100 text-green-700',
}

export function NoteStatusBadge({ status }: { status: string }) {
  const cls = NOTE_CFG[status] ?? 'bg-slate-100 text-slate-600'
  const label = status.charAt(0) + status.slice(1).toLowerCase()
  return <span className={`${BASE} ${cls}`}>{label}</span>
}
