import type { NextAuthConfig } from 'next-auth'

// Edge-safe Auth.js config shared by the full server config (auth.ts) and the
// middleware. It deliberately contains NO adapter and NO Credentials provider —
// those pull in Prisma + bcrypt, which can't run on the Edge runtime where
// middleware executes. The real providers are added back in auth.ts.
//
// The JWT/session callbacks live here so middleware can read the user's id and
// role straight off the token without a database round-trip.
export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    // Persist the user id + role onto the JWT at sign-in, then surface them on
    // the session so server components, route handlers and middleware can read both.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id
      if (token.role) session.user.role = token.role
      return session
    },
  },
}
