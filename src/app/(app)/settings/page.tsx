import ReseedPanel from './reseed-panel'

export const metadata = { title: 'Settings — Clinical Twin' }

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Demo administration · synthetic data only.
        </p>
      </div>

      <ReseedPanel />
    </div>
  )
}
