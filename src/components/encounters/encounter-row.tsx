'use client'

import { useRouter } from 'next/navigation'

export function EncounterRow({
  id,
  children,
}: {
  id:       string
  children: React.ReactNode
}) {
  const router = useRouter()
  return (
    <tr
      onClick={() => router.push(`/encounters/${id}`)}
      className="cursor-pointer border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50"
    >
      {children}
    </tr>
  )
}
