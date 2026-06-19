import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authConfig } from './auth.config'

// External boundary: validate the raw credentials payload before touching the DB.
const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Shared session strategy + jwt/session callbacks live in the edge-safe config.
  ...authConfig,
  // The Prisma adapter persists users/accounts/sessions to Postgres. Note that the
  // Credentials provider requires the JWT session strategy (it cannot create a
  // database Session row), so the adapter is mainly here for account linking and
  // any future OAuth providers. Both are Node-only, so they stay out of authConfig.
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null
        const { email, password } = parsed.data

        const user = await db.user.findUnique({ where: { email } })
        if (!user?.hashedPassword) return null

        const valid = await bcrypt.compare(password, user.hashedPassword)
        if (!valid) return null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        }
      },
    }),
  ],
})
