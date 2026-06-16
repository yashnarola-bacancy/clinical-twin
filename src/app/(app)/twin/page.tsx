import TwinDashboard from '@/components/twin/twin-dashboard'

export const metadata = { title: 'Digital twin — Clinical Twin' }

export default function TwinPage() {
  return (
    <div className="mx-auto max-w-6xl p-8">
      {/* Page header */}
      <header className="mb-8">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Digital twin</h1>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
            Operations Director
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          A baseline simulation of patient flow across the floor — wait times, capacity, and throughput over a modeled day.
        </p>
      </header>

      <TwinDashboard />
    </div>
  )
}
