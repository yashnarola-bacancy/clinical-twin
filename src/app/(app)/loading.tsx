import { Spinner } from '@/components/ui/spinner'

// Shown while any (app) route's server component fetches data, so navigation
// never lands on a blank screen.
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-400">
      <Spinner className="h-6 w-6" />
      <p className="text-sm">Loading…</p>
    </div>
  )
}
