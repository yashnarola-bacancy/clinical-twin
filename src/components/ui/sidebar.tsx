'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, ClipboardList, Mic, LayoutDashboard, Settings } from 'lucide-react'
import { PERSONAS, type PersonaRole } from '@/lib/personas'

type NavItem = { href: string; label: string; Icon: typeof Activity }

// Nav is grouped by persona — the section whose role matches the active user
// is emphasized so it's obvious which links belong to "your view".
const NAV_SECTIONS: { role: PersonaRole; items: NavItem[] }[] = [
  {
    role: 'CLINICIAN',
    items: [
      { href: '/record',     label: 'Record visit', Icon: Mic           },
      { href: '/encounters', label: 'Encounters',   Icon: ClipboardList },
    ],
  },
  {
    role: 'OPS_DIRECTOR',
    items: [
      { href: '/twin', label: 'Digital twin', Icon: Activity },
    ],
  },
  {
    role: 'CMIO',
    items: [
      { href: '/', label: 'KPI dashboard', Icon: LayoutDashboard },
    ],
  },
]

export default function Sidebar({ activeRole }: { activeRole?: string }) {
  const pathname = usePathname()

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-100 bg-white">
      {/* Logo / app title */}
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
          <span className="text-[11px] font-bold tracking-tight">CT</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-slate-900">Clinical Twin</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Docs + digital twin
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map(({ role, items }) => {
          const persona = PERSONAS[role]
          const isActivePersona = role === activeRole
          return (
            <div
              key={role}
              className={[
                'mb-2 rounded-lg px-2 py-2.5 last:mb-0',
                isActivePersona ? 'bg-slate-50 ring-1 ring-slate-100' : '',
              ].join(' ')}
            >
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    isActivePersona ? persona.dot : 'bg-slate-300'
                  }`}
                />
                <span className={isActivePersona ? 'text-slate-600' : 'text-slate-400'}>
                  {persona.label}
                </span>
                {isActivePersona && (
                  <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-slate-500 ring-1 ring-slate-200">
                    Your view
                  </span>
                )}
              </p>
              <ul className="space-y-0.5">
                {items.map(({ href, label, Icon }) => {
                  const active =
                    href === '/'
                      ? pathname === '/'
                      : pathname === href || pathname.startsWith(href + '/')
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={[
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                          active
                            ? 'bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200'
                            : 'text-slate-600 hover:bg-white/70 hover:text-slate-900',
                        ].join(' ')}
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2 : 1.75} />
                        {label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        {/* Admin — demo tools, always available */}
        <div className="mt-2 border-t border-slate-100 px-2 pt-4">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Admin
          </p>
          <ul className="space-y-0.5">
            {(() => {
              const active = pathname === '/settings' || pathname.startsWith('/settings/')
              return (
                <li>
                  <Link
                    href="/settings"
                    className={[
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                      active
                        ? 'bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-600 hover:bg-white/70 hover:text-slate-900',
                    ].join(' ')}
                  >
                    <Settings className="h-4 w-4 shrink-0" strokeWidth={active ? 2 : 1.75} />
                    Settings
                  </Link>
                </li>
              )
            })()}
          </ul>
        </div>
      </nav>
    </aside>
  )
}
