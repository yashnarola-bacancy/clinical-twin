import { PrismaClient, Prisma } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * True for transient connection failures — the serverless Postgres (Neon) can
 * drop or be slow to wake, surfacing as P1001 (can't reach server) / P1017
 * (connection closed) or an initialization error. These are safe to retry.
 */
function isTransientDbError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientInitializationError) return true
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return e.code === 'P1001' || e.code === 'P1017'
  }
  return false
}

/**
 * Retry a read against transient connection drops with a short backoff. Use for
 * idempotent reads in server components so a cold/flaky DB doesn't bounce the
 * user to the error screen mid-demo. Do NOT use to wrap writes.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isTransientDbError(e) || i === attempts - 1) throw e
      await new Promise((r) => setTimeout(r, 200 * (i + 1)))
    }
  }
  throw lastErr
}
