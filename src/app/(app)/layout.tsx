import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import Sidebar from '@/components/ui/sidebar'
import RoleSwitcher from '@/components/ui/role-switcher'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const store = await cookies()
  const savedId = store.get('activeUserId')?.value

  const users = await db.user.findMany({
    select: { id: true, name: true, role: true },
    orderBy: { role: 'asc' },
  })

  // Default to the clinician if no cookie is set or the stored id is stale.
  const activeUser =
    users.find(u => u.id === savedId) ??
    users.find(u => u.role === 'CLINICIAN') ??
    users[0]

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-amber-200">
              Demo
            </span>
          </div>

          <RoleSwitcher users={users} activeUserId={activeUser?.id ?? ''} />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
