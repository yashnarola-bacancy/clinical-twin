'use client'

import { signOut } from 'next-auth/react'
import { LogOut } from 'lucide-react'
import { PERSONAS, type PersonaRole } from '@/lib/personas'

const ROLE_LABELS: Record<string, string> = {
  CLINICIAN:    'Clinician',
  OPS_DIRECTOR: 'Ops Director',
  CMIO:         'CMIO',
}

export default function UserMenu({ name, role }: { name: string; role: string }) {
  const dot = PERSONAS[role as PersonaRole]?.dot ?? 'bg-slate-300'

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-end leading-tight">
        <span className="text-sm font-medium text-slate-700">{name}</span>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          {ROLE_LABELS[role] ?? role}
        </span>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </button>
    </div>
  )
}
