'use server'

import { cookies } from 'next/headers'

export async function setActiveUser(userId: string) {
  const store = await cookies()
  store.set('activeUserId', userId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: false,            // readable client-side for future use
    sameSite: 'lax',
  })
}
