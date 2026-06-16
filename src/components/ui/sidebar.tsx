'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, ClipboardList, Mic, LayoutDashboard } from 'lucide-react'

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
    ],
  },
  {
    label: 'Clinician',
    items: [
      { href: '/record',     label: 'Record visit', Icon: Mic           },
      { href: '/encounters', label: 'Encounters',   Icon: ClipboardList },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/twin', label: 'Digital twin', Icon: Activity },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-100 bg-white">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white">
          <span className="text-[11px] font-bold tracking-tight">CT</span>
        </div>
        <span className="text-sm font-semibold text-slate-900">Clinical Twin</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {NAV_SECTIONS.map(({ label, items }) => (
          <div key={label} className="mb-7 last:mb-0">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {label}
            </p>
            <ul className="space-y-0.5">
              {items.map(({ href, label: itemLabel, Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={[
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                        active
                          ? 'bg-slate-100 font-medium text-slate-900'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                      ].join(' ')}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2 : 1.75} />
                      {itemLabel}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
