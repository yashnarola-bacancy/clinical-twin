import type { LucideIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Reusable empty-state card: dashed border, muted icon, friendly copy, and an
// optional call-to-action. Server-safe (no client interactivity).
// ---------------------------------------------------------------------------

export function EmptyState({
  Icon,
  title,
  description,
  action,
}: {
  Icon?:        LucideIcon
  title:        string
  description?: string
  action?:      React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-100">
          <Icon className="h-6 w-6 text-slate-300" strokeWidth={1.75} />
        </div>
      )}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
