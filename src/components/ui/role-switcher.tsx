'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { setActiveUser } from '@/app/actions'

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
}: {
  users:        UserOption[]
  activeUserId: string
}) {
  const router             = useRouter()
  const [pending, startT]  = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value
    startT(async () => {
      await setActiveUser(newId)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400">Viewing as</span>
      <select
        defaultValue={activeUserId}
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
