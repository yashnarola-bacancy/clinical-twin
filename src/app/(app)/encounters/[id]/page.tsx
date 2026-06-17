import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { db, withDbRetry } from '@/lib/db'
import { fmtTime, diffMin, ageFromDob, DISPOSITION_LABELS } from '@/lib/fmt'
import { StatusBadge, DeptBadge } from '@/components/encounters/badges'
import NoteReview from '@/components/encounters/note-review'
import EhrSync from '@/components/encounters/ehr-sync'

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

  const [enc, cookieStore] = await Promise.all([
    withDbRetry(() => db.encounter.findUnique({
      where: { id },
      include: {
        patient:   true,
        clinician: { select: { name: true, role: true } },
        note: {
          include: { codes: { orderBy: { confidence: 'desc' } } },
        },
        transcript:  { select: { durationSec: true } },
        ehrSyncLogs: {
          select:  { latencyMs: true, success: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })),
    cookies(),
  ])

  if (!enc) notFound()

  const age      = ageFromDob(enc.patient.dob)
  const syncLog  = enc.ehrSyncLogs[0] ?? null
  const dob      = enc.patient.dob.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  const clinicianId = cookieStore.get('activeUserId')?.value ?? null

  return (
    <div className="mx-auto max-w-4xl p-8">

      {/* ── Back link + encounter status ──────────────────────────── */}
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

        {/* Encounter details */}
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

          {enc.orderedLabs.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Ordered labs
              </p>
              <div className="flex flex-wrap gap-1.5">
                {enc.orderedLabs.map((lab) => (
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

          {enc.orderedImaging.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Ordered imaging
              </p>
              <div className="flex flex-wrap gap-1.5">
                {enc.orderedImaging.map((img) => (
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

        {/* Timeline */}
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

      {/* ── Clinical note ───────────────────────────────────────────── */}
      {enc.note ? (
        <NoteReview
          note={{
            id:           enc.note.id,
            status:       enc.note.status,
            subjective:   enc.note.subjective,
            objective:    enc.note.objective,
            assessment:   enc.note.assessment,
            plan:         enc.note.plan,
            aiModel:      enc.note.aiModel,
            generationMs: enc.note.generationMs,
            signedAt:     enc.note.signedAt?.toISOString() ?? null,
            codes: enc.note.codes.map((c) => ({
              id:          c.id,
              system:      c.system,
              code:        c.code,
              description: c.description,
              confidence:  c.confidence,
              accepted:    c.accepted,
            })),
          }}
          encounterId={enc.id}
          clinicianId={clinicianId}
        />
      ) : (
        <div className="rounded-xl border border-slate-100 bg-white">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Clinical note</h2>
          </div>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-slate-700">No clinical note yet</p>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              A note will appear here once the encounter moves to the Awaiting Review stage.
            </p>
          </div>
        </div>
      )}

      {/* ── EHR sync (only once the note is signed) ─────────────────── */}
      {enc.note?.status === 'SIGNED' && (
        <EhrSync
          encounterId={enc.id}
          initialSynced={enc.status === 'SYNCED'}
          syncedAt={enc.syncedAt?.toISOString() ?? null}
          latencyMs={syncLog?.latencyMs ?? null}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout helpers
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
        {note && <span className="ml-2 text-slate-400">· {note}</span>}
      </div>
    </li>
  )
}
