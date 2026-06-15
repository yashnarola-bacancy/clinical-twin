'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2, ShieldCheck } from 'lucide-react'
import { CODE_SYSTEM_LABELS } from '@/lib/fmt'

// ---------------------------------------------------------------------------
// Type exported so the server page can build the serialized prop safely
// ---------------------------------------------------------------------------

export type SerializedNote = {
  id:           string
  status:       string        // 'DRAFT' | 'EDITED' | 'SIGNED'
  subjective:   string
  objective:    string
  assessment:   string
  plan:         string
  aiModel:      string | null
  generationMs: number | null
  signedAt:     string | null // Date serialised to ISO string by the page
  codes: {
    id:          string
    system:      string       // 'ICD10CM' | 'CPT' | 'SNOMEDCT'
    code:        string
    description: string
    confidence:  number       // 0–1
    accepted:    boolean
  }[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Fields = { subjective: string; objective: string; assessment: string; plan: string }
type SoapKey = keyof Fields

const SOAP_FIELDS: { key: SoapKey; label: string }[] = [
  { key: 'subjective', label: 'Subjective' },
  { key: 'objective',  label: 'Objective'  },
  { key: 'assessment', label: 'Assessment' },
  { key: 'plan',       label: 'Plan'       },
]

function fmtSignedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NoteReview({
  note,
  encounterId,
  clinicianId,
}: {
  note:        SerializedNote
  encounterId: string
  clinicianId: string | null
}) {
  const router = useRouter()

  // ── State ──────────────────────────────────────────────────────────
  const [fields, setFields] = useState<Fields>({
    subjective: note.subjective,
    objective:  note.objective,
    assessment: note.assessment,
    plan:       note.plan,
  })

  const [accepted, setAccepted] = useState<Record<string, boolean>>(
    () => Object.fromEntries(note.codes.map((c) => [c.id, c.accepted]))
  )

  const [signed,   setSigned]   = useState(note.status === 'SIGNED')
  const [signing,  setSigning]  = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [signedAt, setSignedAt] = useState<string | null>(note.signedAt)

  // Derived
  const readonly = signed
  const busy     = signing

  // Which fields the clinician changed vs the AI-generated originals
  const editedFields = SOAP_FIELDS
    .filter(({ key }) => fields[key] !== note[key])
    .map(({ key }) => key)

  const acceptedCodeIds = Object.entries(accepted)
    .filter(([, v]) => v)
    .map(([id]) => id)

  // ── Handlers ───────────────────────────────────────────────────────
  function toggleCode(id: string) {
    setAccepted((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleSign() {
    setSigning(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/sign-off', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId:      note.id,
          encounterId,
          signedById:  clinicianId,
          fields,
          editedFields,
          acceptedCodeIds,
        }),
      })
      const data = await res.json() as {
        ok:    boolean
        data?: { signedAt: string | null; codes: { id: string; accepted: boolean }[] }
        error?: string
      }
      if (!data.ok) throw new Error(data.error ?? 'Sign-off failed')

      // Sync accepted state from the authoritative server response
      if (data.data?.codes) {
        setAccepted(Object.fromEntries(data.data.codes.map((c) => [c.id, c.accepted])))
      }
      setSignedAt(data.data?.signedAt ?? null)
      setSigned(true)

      // Refresh so the encounter-status badge in the page header reflects SIGNED
      router.refresh()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign-off failed')
    } finally {
      setSigning(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-slate-100 bg-white">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Clinical note</h2>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          {note.aiModel && <span>{note.aiModel}</span>}
          {note.generationMs != null && (
            <span>{(note.generationMs / 1000).toFixed(1)} s generation</span>
          )}

          {signed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
              <ShieldCheck className="h-3 w-3" />
              Signed
              {signedAt && (
                <span className="font-normal opacity-75">· {fmtSignedAt(signedAt)}</span>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              Draft
            </span>
          )}
        </div>
      </div>

      {/* ── SOAP fields ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
        {SOAP_FIELDS.map(({ key, label }) => {
          const isEdited = !readonly && fields[key] !== note[key]
          return (
            <div key={key}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {label}
                </span>
                {isEdited && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-amber-400"
                    title="Edited from AI draft"
                  />
                )}
              </div>

              {readonly ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {fields[key]}
                </p>
              ) : (
                <textarea
                  value={fields[key]}
                  onChange={(e) =>
                    setFields((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  disabled={busy}
                  rows={6}
                  className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-700 transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Billing codes ────────────────────────────────────────────── */}
      {note.codes.length > 0 && (
        <div className="border-t border-slate-100 px-6 pb-6 pt-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Billing codes
            </h3>
            {!readonly && (
              <span className="text-xs text-slate-400">
                suggestion — requires clinician sign-off
              </span>
            )}
          </div>

          <div className="space-y-2">
            {note.codes.map((code) => {
              const isAccepted = accepted[code.id] ?? false
              return (
                <div
                  key={code.id}
                  className={[
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-xs transition-colors',
                    isAccepted ? 'border-green-200 bg-green-50/50' : 'border-slate-200 bg-white',
                  ].join(' ')}
                >
                  {/* System */}
                  <span
                    className={[
                      'w-12 shrink-0 font-medium',
                      isAccepted ? 'text-green-700' : 'text-slate-400',
                    ].join(' ')}
                  >
                    {CODE_SYSTEM_LABELS[code.system] ?? code.system}
                  </span>

                  {/* Code */}
                  <span
                    className={[
                      'w-16 shrink-0 font-mono',
                      isAccepted ? 'text-slate-800' : 'text-slate-400 line-through',
                    ].join(' ')}
                  >
                    {code.code}
                  </span>

                  {/* Description */}
                  <span
                    className={[
                      'flex-1 truncate',
                      isAccepted ? 'text-slate-700' : 'text-slate-400',
                    ].join(' ')}
                  >
                    {code.description}
                  </span>

                  {/* Confidence */}
                  <span className="shrink-0 tabular-nums text-slate-400">
                    {Math.round(code.confidence * 100)}%
                  </span>

                  {/* Toggle / indicator */}
                  {!readonly ? (
                    <button
                      onClick={() => toggleCode(code.id)}
                      disabled={busy}
                      title={isAccepted ? 'Click to reject' : 'Click to accept'}
                      className={[
                        'ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed',
                        isAccepted
                          ? 'bg-green-100 text-green-600 hover:bg-green-200'
                          : 'bg-slate-100 text-slate-400 hover:bg-slate-200',
                      ].join(' ')}
                    >
                      {isAccepted ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </button>
                  ) : (
                    <span
                      className={[
                        'ml-1 flex h-6 w-6 shrink-0 items-center justify-center',
                        isAccepted ? 'text-green-600' : 'text-slate-400',
                      ].join(' ')}
                    >
                      {isAccepted ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Sign-off bar (hidden once signed) ───────────────────────── */}
      {!readonly && (
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <div className="text-xs">
            {errorMsg ? (
              <span className="text-red-500">{errorMsg}</span>
            ) : editedFields.length > 0 ? (
              <span className="text-amber-600">
                {editedFields.length} field{editedFields.length !== 1 ? 's' : ''} edited from AI draft
              </span>
            ) : (
              <span className="text-slate-400">Review all sections before signing</span>
            )}
          </div>

          <button
            onClick={handleSign}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Sign off
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
