import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { db } from '@/lib/db'
import {
  fmtTime,
  diffMin,
  ageFromDob,
  DISPOSITION_LABELS,
  CODE_SYSTEM_LABELS,
} from '@/lib/fmt'
import { StatusBadge, DeptBadge, NoteStatusBadge } from '@/components/encounters/badges'

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const enc = await db.encounter.findUnique({
    where: { id },
    select: { patient: { select: { firstName: true, lastName: true } } },
  })
  if (!enc) return { title: 'Not found — Clinical Twin' }
  return { title: `${enc.patient.firstName} ${enc.patient.lastName} — Clinical Twin` }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function EncounterDetailPage({ params }: Props) {
  const { id } = await params

  const enc = await db.encounter.findUnique({
    where: { id },
    include: {
      patient:  true,
      clinician: { select: { name: true, role: true } },
      note: {
        include: {
          codes: { orderBy: { confidence: 'desc' } },
        },
      },
      transcript: { select: { durationSec: true } },
      ehrSyncLogs: {
        select: { latencyMs: true, success: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!enc) notFound()

  const age     = ageFromDob(enc.patient.dob)
  const syncLog = enc.ehrSyncLogs[0] ?? null
  const dob     = enc.patient.dob.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="mx-auto max-w-4xl p-8">

      {/* ── Back link + status ─────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/encounters"
          className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Encounters
        </Link>
        <StatusBadge status={enc.status} />
      </div>

      {/* ── Patient header ─────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {enc.patient.firstName} {enc.patient.lastName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {enc.patient.mrn} · {age} yo {enc.patient.sex} · DOB {dob}
        </p>
        <p className="mt-0.5 text-sm text-slate-500">
          {enc.clinician.name} ·{' '}
          <span className="capitalize">
            {enc.clinician.role.replace(/_/g, ' ').toLowerCase()}
          </span>
        </p>
      </div>

      {/* ── Info grid ──────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">

        {/* Encounter details card */}
        <div className="rounded-xl border border-slate-100 bg-white p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Encounter
          </h2>

          <dl className="space-y-3 text-sm">
            <Row label="Department">
              <DeptBadge dept={enc.department} />
            </Row>

            {enc.chiefComplaint && (
              <Row label="Chief complaint">
                <span className="text-slate-800">{enc.chiefComplaint}</span>
              </Row>
            )}

            {enc.predictedDisposition && (
              <Row label="Predicted disposition">
                <span className="text-slate-800">
                  {DISPOSITION_LABELS[enc.predictedDisposition] ?? enc.predictedDisposition}
                  {enc.dispositionConfidence != null && (
                    <span className="ml-1.5 text-xs font-medium text-slate-400">
                      {Math.round(enc.dispositionConfidence * 100)}% confidence
                    </span>
                  )}
                </span>
              </Row>
            )}
          </dl>

          {/* Ordered labs */}
          {enc.orderedLabs.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Ordered labs
              </p>
              <div className="flex flex-wrap gap-1.5">
                {enc.orderedLabs.map(lab => (
                  <span
                    key={lab}
                    className="rounded-md bg-slate-50 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-inset ring-slate-200"
                  >
                    {lab}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Ordered imaging */}
          {enc.orderedImaging.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Ordered imaging
              </p>
              <div className="flex flex-wrap gap-1.5">
                {enc.orderedImaging.map(img => (
                  <span
                    key={img}
                    className="rounded-md bg-slate-50 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-inset ring-slate-200"
                  >
                    {img}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Timeline card */}
        <div className="rounded-xl border border-slate-100 bg-white p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Timeline
          </h2>

          <ol className="space-y-3 text-sm">
            <TimelineItem label="Checked in" time={fmtTime(enc.checkInAt)} />

            {enc.examStartAt && (
              <TimelineItem
                label="Exam started"
                time={fmtTime(enc.examStartAt)}
                note={`+${diffMin(enc.checkInAt, enc.examStartAt)} min wait`}
              />
            )}

            {enc.examStartAt && enc.examEndAt && (
              <TimelineItem
                label="Exam ended"
                time={fmtTime(enc.examEndAt)}
                note={`${diffMin(enc.examStartAt, enc.examEndAt)} min exam`}
              />
            )}

            {enc.signedAt && (
              <TimelineItem label="Note signed" time={fmtTime(enc.signedAt)} />
            )}

            {enc.syncedAt && syncLog && (
              <TimelineItem
                label="Synced to EHR"
                time={fmtTime(enc.syncedAt)}
                note={`${syncLog.latencyMs} ms`}
              />
            )}
          </ol>
        </div>
      </div>

      {/* ── Clinical note ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-100 bg-white">
        {/* Note header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Clinical note</h2>

          {enc.note && (
            <div className="flex items-center gap-3 text-xs text-slate-400">
              {enc.note.aiModel && <span>{enc.note.aiModel}</span>}
              {enc.note.generationMs != null && (
                <span>{(enc.note.generationMs / 1000).toFixed(1)} s generation</span>
              )}
              <NoteStatusBadge status={enc.note.status} />
            </div>
          )}
        </div>

        {enc.note ? (
          <div className="p-6">
            {/* SOAP sections */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <SoapSection title="Subjective" body={enc.note.subjective} />
              <SoapSection title="Objective"  body={enc.note.objective}  />
              <SoapSection title="Assessment" body={enc.note.assessment} />
              <SoapSection title="Plan"       body={enc.note.plan}       />
            </div>

            {/* Billing codes */}
            {enc.note.codes.length > 0 && (
              <div className="mt-8">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Billing codes
                </h3>
                <div className="overflow-hidden rounded-lg border border-slate-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        <th className="px-3 py-2 text-left font-semibold text-slate-400">System</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-400">Code</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-400">Description</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-400">Conf.</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-400">Accepted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enc.note.codes.map(c => (
                        <tr key={c.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 text-slate-500">
                            {CODE_SYSTEM_LABELS[c.system] ?? c.system}
                          </td>
                          <td
                            className={[
                              'px-3 py-2 font-mono',
                              c.accepted ? 'text-slate-800' : 'text-slate-400 line-through',
                            ].join(' ')}
                          >
                            {c.code}
                          </td>
                          <td
                            className={[
                              'px-3 py-2',
                              c.accepted ? 'text-slate-700' : 'text-slate-400',
                            ].join(' ')}
                          >
                            {c.description}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {Math.round(c.confidence * 100)}%
                          </td>
                          <td className="px-3 py-2 text-center">
                            {c.accepted ? (
                              <span className="text-green-600">✓</span>
                            ) : (
                              <span className="text-slate-400">✗</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* No note yet */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-slate-700">No clinical note yet</p>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              A note will be generated once the encounter moves to the Awaiting Review stage.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small layout helpers (private to this file)
// ---------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function TimelineItem({
  label,
  time,
  note,
}: {
  label: string
  time:  string
  note?: string
}) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300 ring-2 ring-slate-100" />
      <div className="flex-1 text-slate-700">{label}</div>
      <div className="text-right">
        <span className="tabular-nums text-slate-500">{time}</span>
        {note && (
          <span className="ml-2 text-slate-400">· {note}</span>
        )}
      </div>
    </li>
  )
}

function SoapSection({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{body}</p>
    </div>
  )
}
