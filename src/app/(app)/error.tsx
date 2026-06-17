'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

// Catches errors thrown by any (app) route (e.g. a failed DB query in a server
// component) and offers a friendly recovery path instead of a broken screen.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 ring-1 ring-red-100">
        <AlertTriangle className="h-6 w-6 text-red-400" strokeWidth={1.75} />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-800">Something went wrong</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
        We couldn&rsquo;t load this page. This is a demo environment — the database or an API
        service may be temporarily unavailable.
      </p>
      <button
        onClick={reset}
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  )
}
