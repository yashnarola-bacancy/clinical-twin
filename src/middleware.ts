import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '../auth.config'

// Edge-safe Auth.js instance built from the adapter-free config. It can read the
// JWT (and therefore the user's id + role) without touching the database.
const { auth } = NextAuth(authConfig)

// Routes reachable without a session. Everything else requires login.
const PUBLIC_ROUTES = ['/login', '/signup']

// Role-gated routes. A logged-in user without an allowed role is shown the
// "not authorized" page (via rewrite) rather than being bounced to login.
const ROLE_RULES: { test: (path: string) => boolean; allow: string[] }[] = [
  // Digital twin: operations + quality personas only.
  { test: (p) => p === '/twin' || p.startsWith('/twin/'), allow: ['OPS_DIRECTOR', 'CMIO'] },
  // Seed-reset / admin page (the sidebar "Admin" section lives at /settings): CMIO only.
  {
    test: (p) => p === '/settings' || p.startsWith('/settings/') || p === '/admin' || p.startsWith('/admin/'),
    allow: ['CMIO'],
  },
]

export default auth((req) => {
  const { nextUrl } = req
  const path = nextUrl.pathname
  const session = req.auth

  const isPublic = PUBLIC_ROUTES.some((p) => path === p || path.startsWith(p + '/'))

  // ── Unauthenticated ───────────────────────────────────────────────
  if (!session?.user) {
    if (isPublic) return NextResponse.next()
    const loginUrl = new URL('/login', nextUrl)
    return NextResponse.redirect(loginUrl)
  }

  // ── Authenticated: enforce role rules ─────────────────────────────
  const role = session.user.role
  for (const rule of ROLE_RULES) {
    if (rule.test(path) && !rule.allow.includes(role)) {
      // Rewrite (not redirect) so the URL stays put and we show a 403-style page.
      return NextResponse.rewrite(new URL('/not-authorized', nextUrl))
    }
  }

  return NextResponse.next()
})

export const config = {
  // Run on everything except API routes (they self-gate with JSON 401s),
  // Next.js internals, and static files (anything with a file extension).
  matcher: ['/((?!api|_next|.*\\..*).*)'],
}
