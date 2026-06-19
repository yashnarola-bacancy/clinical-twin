import type { Role } from '@prisma/client'
import type { DefaultSession } from 'next-auth'

// Augment Auth.js types so the user's `role` is typed everywhere it flows:
// the User returned from `authorize`, the JWT, and the Session.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role
    } & DefaultSession['user']
  }

  interface User {
    role: Role
  }
}

// `next-auth/jwt` only re-exports from `@auth/core/jwt`, so the augmentation has
// to target the original module for the callbacks to pick up the typed fields.
declare module '@auth/core/jwt' {
  interface JWT {
    id?: string
    role?: Role
  }
}
