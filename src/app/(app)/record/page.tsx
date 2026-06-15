import { Mic } from 'lucide-react'

export const metadata = { title: 'Record visit — Clinical Twin' }

export default function RecordPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Record visit</h1>
        <p className="mt-1 text-sm text-slate-500">
          Capture encounter audio, generate SOAP note, and suggest billing codes.
        </p>
      </div>

      {/* Placeholder state */}
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-20 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <Mic className="h-6 w-6 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-700">Audio recorder coming soon</p>
        <p className="mt-1 max-w-xs text-xs text-slate-400">
          This view will provide a browser-based recorder, live transcription, and AI-generated SOAP note with ICD-10 / CPT code suggestions.
        </p>
      </div>
    </div>
  )
}
