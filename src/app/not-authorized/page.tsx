import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'

export const metadata = { title: 'Not authorized — Clinical Twin' }

export default function NotAuthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50">
          <ShieldAlert className="h-5 w-5 text-red-500" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Not authorized</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Your account doesn&apos;t have access to this area. If you think this is a mistake,
          contact an administrator or switch to an account with the right role.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
