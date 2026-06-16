import { format } from 'date-fns'
import { Clock, FileCheck2, Timer, ClipboardList } from 'lucide-react'
import { db } from '@/lib/db'
import { StatCard } from '@/components/dashboard/stat-card'
import NotesChart, { type DayDatum } from '@/components/dashboard/notes-chart'

export const metadata = { title: 'Dashboard — Clinical Twin' }

// Status display order + dot color for the "Encounters processed" breakdown.
const STATUS_META: { key: string; label: string; dot: string }[] = [
  { key: 'CHECKED_IN',      label: 'Checked in',      dot: 'bg-slate-300'   },
  { key: 'IN_EXAM',         label: 'In exam',         dot: 'bg-blue-400'    },
  { key: 'AWAITING_REVIEW', label: 'Awaiting review', dot: 'bg-amber-400'   },
  { key: 'SIGNED',          label: 'Signed',          dot: 'bg-green-500'   },
  { key: 'SYNCED',          label: 'Synced',          dot: 'bg-emerald-500' },
]

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export default async function DashboardPage() {
  // 14-day window (inclusive of today), bucketed by local day.
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  const windowStart = new Date(base)
  windowStart.setDate(base.getDate() - 13)

  const [genAgg, signedTotal, signedClean, syncAgg, statusGroups, signedNotes] =
    await Promise.all([
      db.clinicalNote.aggregate({ _avg: { generationMs: true } }),
      db.clinicalNote.count({ where: { status: 'SIGNED' } }),
      db.clinicalNote.count({ where: { status: 'SIGNED', editedFields: { isEmpty: true } } }),
      db.ehrSyncLog.aggregate({ _avg: { latencyMs: true } }),
      db.encounter.groupBy({ by: ['status'], _count: { _all: true } }),
      db.clinicalNote.findMany({
        where: { signedAt: { gte: windowStart } },
        select: { signedAt: true },
      }),
    ])

  // ── KPI 1: avg note generation time (seconds, target < 60s) ───────
  const avgGenMs = genAgg._avg.generationMs
  const genValue = avgGenMs != null ? `${(avgGenMs / 1000).toFixed(1)}s` : '—'
  const genMeets = avgGenMs != null && avgGenMs < 60_000

  // ── KPI 2: notes signed without edits (% — proxy for 98% accuracy) ─
  const cleanPct = signedTotal > 0 ? Math.round((signedClean / signedTotal) * 100) : null
  const accValue = cleanPct != null ? `${cleanPct}%` : '—'
  const accMeets = cleanPct != null && cleanPct >= 98

  // ── KPI 3: avg EHR sync latency (seconds) ─────────────────────────
  const avgSyncMs = syncAgg._avg.latencyMs
  const syncValue = avgSyncMs != null ? `${(avgSyncMs / 1000).toFixed(1)}s` : '—'

  // ── KPI 4: encounters processed (count by status) ─────────────────
  const countByStatus = new Map<string, number>(
    statusGroups.map((g) => [g.status, g._count._all]),
  )
  const totalEncounters = statusGroups.reduce((sum, g) => sum + g._count._all, 0)
  const breakdown = STATUS_META.map((s) => ({
    ...s,
    count: countByStatus.get(s.key) ?? 0,
  })).filter((s) => s.count > 0)

  // ── Chart: notes signed per day over the last 14 days ─────────────
  const buckets = new Map<string, number>()
  for (const n of signedNotes) {
    if (!n.signedAt) continue
    const k = dayKey(new Date(n.signedAt))
    buckets.set(k, (buckets.get(k) ?? 0) + 1)
  }
  const chartData: DayDatum[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(windowStart)
    d.setDate(windowStart.getDate() + i)
    return {
      label: format(d, 'd'),
      full:  format(d, 'MMM d'),
      count: buckets.get(dayKey(d)) ?? 0,
    }
  })

  return (
    <div className="mx-auto max-w-6xl p-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Success metrics from the PRD, computed from live encounter data.
        </p>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Avg note generation"
          value={genValue}
          target="PRD target: under 60s"
          meetsTarget={genMeets}
          Icon={Clock}
        />
        <StatCard
          label="Signed without edits"
          value={accValue}
          target="PRD target: 98% accuracy"
          meetsTarget={accMeets}
          Icon={FileCheck2}
        />
        <StatCard
          label="Avg EHR sync latency"
          value={syncValue}
          target="Round-trip to mock EHR"
          Icon={Timer}
        />
        <StatCard
          label="Encounters processed"
          value={String(totalEncounters)}
          Icon={ClipboardList}
          footer={
            <div className="flex flex-col gap-1.5">
              {breakdown.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-xs">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  <span className="font-semibold tabular-nums text-slate-700">{s.count}</span>
                  <span className="text-slate-400">{s.label}</span>
                </div>
              ))}
            </div>
          }
        />
      </div>

      {/* Notes-per-day chart */}
      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-slate-900">Notes processed</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Signed notes per day · last 14 days
          </p>
        </div>
        <NotesChart data={chartData} />
      </div>
    </div>
  )
}
