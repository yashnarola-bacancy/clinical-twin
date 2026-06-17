// ---------------------------------------------------------------------------
// Lightweight ring spinner. Pass size via className (defaults to h-5 w-5).
// Server-safe — used by route loading.tsx files and inline busy states.
// ---------------------------------------------------------------------------

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-slate-200 border-t-slate-500 ${
        className ?? 'h-5 w-5'
      }`}
    />
  )
}
