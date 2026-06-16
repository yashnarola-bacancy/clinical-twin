import type { LucideIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Simple KPI stat card: large number, label + target/footer below.
// Server-safe (no client interactivity).
// ---------------------------------------------------------------------------

export function StatCard({
  label,
  value,
  target,
  Icon,
  meetsTarget,
  footer,
}: {
  label:        string
  value:        string
  target?:      string
  Icon?:        LucideIcon
  meetsTarget?: boolean // when set, colors a dot next to the target line
  footer?:      React.ReactNode // replaces the target line (e.g. status breakdown)
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-slate-400" strokeWidth={1.75} />}
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </p>
      </div>

      <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
        {value}
      </p>

      {footer ? (
        <div className="mt-3">{footer}</div>
      ) : target ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
          {meetsTarget != null && (
            <span
              className={[
                'h-1.5 w-1.5 rounded-full',
                meetsTarget ? 'bg-emerald-500' : 'bg-amber-400',
              ].join(' ')}
            />
          )}
          {target}
        </p>
      ) : null}
    </div>
  )
}
