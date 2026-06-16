'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, UploadCloud, ChevronRight } from 'lucide-react'

// ---------------------------------------------------------------------------
// EHR sync panel — shown on the encounter detail page once a note is SIGNED.
//
//  • SIGNED, not yet synced → "Sync to EHR" button
//  • clicking            → POST /api/ehr-sync, spinner
//  • success             → green "Synced to EHR ✓" + latency + collapsible bundle
//  • already SYNCED      → "Synced" badge + timestamp (+ latency)
// ---------------------------------------------------------------------------

type SyncResponse =
  | { ok: true; data: { latencyMs: number; bundle: unknown } }
  | { ok: false; error: string }

function fmtLatency(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtSyncedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function EhrSync({
  encounterId,
  initialSynced,
  syncedAt,
  latencyMs,
}: {
  encounterId:   string
  initialSynced: boolean
  syncedAt:      string | null  // ISO, from the latest sync log
  latencyMs:     number | null  // from the latest sync log
}) {
  const router = useRouter()

  const [synced,   setSynced]   = useState(initialSynced)
  const [syncing,  setSyncing]  = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Populated when the sync happens in this session (gives us the live bundle).
  const [result, setResult] = useState<{ latencyMs: number; bundle: unknown } | null>(null)

  // Effective latency to display: live result first, else the persisted log.
  const shownLatency = result?.latencyMs ?? latencyMs

  async function handleSync() {
    setSyncing(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/ehr-sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ encounterId }),
      })
      const data = (await res.json()) as SyncResponse
      if (!data.ok) throw new Error(data.error)

      setResult(data.data)
      setSynced(true)

      // Refresh so the page header status badge + timeline reflect SYNCED.
      router.refresh()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'EHR sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-100 bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">EHR sync</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Push the signed note to the (mock) EHR as a FHIR R4 bundle.
          </p>
        </div>

        {/* Right side: badge when synced, button otherwise */}
        {synced ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Synced
            {syncedAt && (
              <span className="font-normal opacity-75">· {fmtSyncedAt(syncedAt)}</span>
            )}
          </span>
        ) : (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Syncing…
              </>
            ) : (
              <>
                <UploadCloud className="h-4 w-4" />
                Sync to EHR
              </>
            )}
          </button>
        )}
      </div>

      <div className="px-6 py-4">
        {/* Error */}
        {errorMsg && !synced && (
          <p className="text-xs text-red-500">{errorMsg}</p>
        )}

        {/* Pre-sync helper */}
        {!synced && !errorMsg && (
          <p className="text-xs text-slate-400">
            Note is signed and ready to sync.
          </p>
        )}

        {/* Synced confirmation */}
        {synced && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Synced to EHR ✓
              {shownLatency != null && (
                <span className="font-normal text-emerald-600">
                  · {fmtLatency(shownLatency)}
                </span>
              )}
            </p>

            {/* Collapsible FHIR bundle — only when synced this session */}
            {result && (
              <details className="group mt-3">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-emerald-700 transition-colors hover:text-emerald-800">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                  View FHIR bundle
                </summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">
                  {JSON.stringify(result.bundle, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
