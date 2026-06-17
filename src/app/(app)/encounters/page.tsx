import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { db, withDbRetry } from '@/lib/db'
import { fmtCheckIn, DISPOSITION_LABELS } from '@/lib/fmt'
import { StatusBadge, DeptBadge } from '@/components/encounters/badges'
import { EncounterRow } from '@/components/encounters/encounter-row'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = { title: 'Encounters — Clinical Twin' }

export default async function EncountersPage() {
  const encounters = await withDbRetry(() => db.encounter.findMany({
    select: {
      id:                   true,
      status:               true,
      department:           true,
      chiefComplaint:       true,
      checkInAt:            true,
      predictedDisposition: true,
      dispositionConfidence: true,
      patient: {
        select: { firstName: true, lastName: true, mrn: true },
      },
    },
    orderBy: { checkInAt: 'desc' },
  }))

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Encounters</h1>
        <p className="mt-1 text-sm text-slate-500">
          {encounters.length} encounters · ordered by check-in time
        </p>
      </div>

      {/* Table */}
      {encounters.length === 0 ? (
        <EmptyState
          Icon={ClipboardList}
          title="No encounters yet"
          description="Encounters appear here once patients are checked in. Seed the demo database or record a visit to get started."
          action={
            <Link
              href="/record"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700"
            >
              Record a visit
            </Link>
          }
        />
      ) : (
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Patient
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Chief complaint
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Dept
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Check-in
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Disposition
              </th>
            </tr>
          </thead>
          <tbody>
            {encounters.map(enc => (
              <EncounterRow key={enc.id} id={enc.id}>
                {/* Patient */}
                <td className="px-4 py-3">
                  <span className="font-medium text-slate-900">
                    {enc.patient.firstName} {enc.patient.lastName}
                  </span>
                  <span className="ml-2 text-xs text-slate-400">{enc.patient.mrn}</span>
                </td>

                {/* Chief complaint */}
                <td className="px-4 py-3 text-slate-600">
                  {enc.chiefComplaint ?? <span className="text-slate-300">—</span>}
                </td>

                {/* Department */}
                <td className="px-4 py-3">
                  <DeptBadge dept={enc.department} />
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <StatusBadge status={enc.status} />
                </td>

                {/* Check-in time */}
                <td className="px-4 py-3 tabular-nums text-slate-500">
                  {fmtCheckIn(enc.checkInAt)}
                </td>

                {/* Disposition + confidence */}
                <td className="px-4 py-3">
                  {enc.predictedDisposition ? (
                    <span className="text-slate-700">
                      {DISPOSITION_LABELS[enc.predictedDisposition] ?? enc.predictedDisposition}
                      {enc.dispositionConfidence != null && (
                        <span className="ml-1.5 text-xs text-slate-400">
                          {Math.round(enc.dispositionConfidence * 100)}%
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </EncounterRow>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
