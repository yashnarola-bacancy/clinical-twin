'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Database, RefreshCw } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { reseedDatabase, type ReseedResult } from './actions'

export default function ReseedPanel() {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<ReseedResult | null>(null)
  const [pending, startTransition] = useTransition()

  function run() {
    setResult(null)
    startTransition(async () => {
      const res = await reseedDatabase()
      setResult(res)
      setConfirming(false)
      if (res.ok) router.refresh() // pull fresh server data into the UI
    })
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Database className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Reset demo data</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Deletes <span className="font-medium text-slate-600">all</span> current encounters,
            notes, transcripts, and sync logs, then regenerates a fresh batch of synthetic data —
            including a few pre-signed encounters so the KPIs and digital twin have data right away.
            Use this to get back to a clean state before a demo.
          </p>
        </div>
      </div>

      {/* Action area */}
      <div className="mt-5 border-t border-slate-100 pt-5">
        {pending ? (
          <div className="flex items-center gap-2.5 text-sm text-slate-500">
            <Spinner className="h-4 w-4" />
            Clearing and reseeding the database…
          </div>
        ) : confirming ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              This permanently deletes all current data. Continue?
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={run}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Yes, reset &amp; re-seed
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              setResult(null)
              setConfirming(true)
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset &amp; re-seed database
          </button>
        )}

        {/* Result */}
        {result?.ok && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="text-xs text-emerald-800">
              <p className="font-medium">Database reset to a clean demo state.</p>
              <p className="mt-1 text-emerald-700">
                {result.data.patients} patients · {result.data.encounters} encounters ·{' '}
                {result.data.notes} signed notes · {result.data.syncLogs} EHR sync logs.
              </p>
            </div>
          </div>
        )}

        {result && !result.ok && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-red-50 p-3 ring-1 ring-inset ring-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div className="text-xs text-red-700">
              <p className="font-medium">Re-seed failed</p>
              <p className="mt-1">{result.error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
