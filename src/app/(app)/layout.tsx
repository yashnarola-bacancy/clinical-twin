import { redirect } from 'next/navigation'
import { auth } from '../../../auth'
import Sidebar from '@/components/ui/sidebar'
import UserMenu from '@/components/ui/user-menu'
import { PERSONAS, type PersonaRole } from '@/lib/personas'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // The whole app is identified by the Auth.js session now. No session → login.
  const session = await auth()
  if (!session?.user) redirect('/login')

  const activeUser = session.user
  const persona = PERSONAS[activeUser.role as PersonaRole] ?? null

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar activeRole={activeUser.role} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6">
          <div className="flex items-center gap-2.5">
            {persona && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${persona.chip}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${persona.dot}`} />
                {persona.label} view
              </span>
            )}
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-inset ring-amber-200">
              Demo
            </span>
          </div>

          <UserMenu name={activeUser.name ?? activeUser.email ?? 'User'} role={activeUser.role} />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
