'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { setActiveUser } from '@/app/actions'
import { PERSONAS, landingForRole, type PersonaRole } from '@/lib/personas'

const ROLE_LABELS: Record<string, string> = {
  CLINICIAN:    'Clinician',
  OPS_DIRECTOR: 'Ops Director',
  CMIO:         'CMIO',
}

type UserOption = {
  id:   string
  name: string
  role: string
}

export default function RoleSwitcher({
  users,
  activeUserId,
  activeRole,
}: {
  users:        UserOption[]
  activeUserId: string
  activeRole?:  string
}) {
  const router            = useRouter()
  const [pending, startT] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value
    const role  = users.find(u => u.id === newId)?.role
    startT(async () => {
      await setActiveUser(newId)
      // Drop the user on their persona's landing page, then refresh so the
      // server-rendered chrome (persona chip, nav emphasis) updates.
      router.push(landingForRole(role))
      router.refresh()
    })
  }

  const dot = PERSONAS[activeRole as PersonaRole]?.dot ?? 'bg-slate-300'

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        Viewing as
      </span>
      <select
        value={activeUserId}
        onChange={handleChange}
        disabled={pending}
        className="h-8 min-w-[210px] cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition-opacity focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
      >
        {users.map(u => (
          <option key={u.id} value={u.id}>
            {u.name} · {ROLE_LABELS[u.role] ?? u.role}
          </option>
        ))}
      </select>
    </div>
  )
}
