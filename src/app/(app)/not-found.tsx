import Link from 'next/link'
import { FileQuestion } from 'lucide-react'

// Rendered when notFound() is called (e.g. an unknown encounter id) or a route
// under (app) doesn't match — stays inside the app shell with a way back.
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-100">
        <FileQuestion className="h-6 w-6 text-slate-300" strokeWidth={1.75} />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-800">Page not found</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
        The encounter or page you&rsquo;re looking for doesn&rsquo;t exist or may have been removed.
      </p>
      <Link
        href="/encounters"
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
      >
        Back to encounters
      </Link>
    </div>
  )
}
