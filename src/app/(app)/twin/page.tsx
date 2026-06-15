import { Activity } from 'lucide-react'

export const metadata = { title: 'Digital twin — Clinical Twin' }

export default function TwinPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Digital twin</h1>
        <p className="mt-1 text-sm text-slate-500">
          Simulate patient flow and run what-if scenarios against operational parameters.
        </p>
      </div>

      {/* Placeholder state */}
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-20 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <Activity className="h-6 w-6 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-700">Simulation engine coming soon</p>
        <p className="mt-1 max-w-xs text-xs text-slate-400">
          This view will expose configurable sliders for bed count, nurse ratios, and arrival rates, and plot wait-time distributions in real time.
        </p>
      </div>
    </div>
  )
}
