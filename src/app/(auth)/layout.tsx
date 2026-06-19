// Standalone shell for unauthenticated pages (signup, etc.). Deliberately
// outside the (app) group so it has none of the sidebar/header chrome and is
// not gated by any auth check.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
          <span className="text-[12px] font-bold tracking-tight">CT</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-slate-900">Clinical Twin</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Docs + digital twin
          </span>
        </div>
      </div>
      {children}
    </div>
  )
}
