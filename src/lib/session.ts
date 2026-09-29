// Server-side session lookup for API routes.
//
// The proxy verifies the cookie before a request reaches a route handler, so
// this is a second read of the same signed token rather than a new check. It
// exists because route handlers need the identity, not just the answer "signed
// in or not", and because a handler must not trust a header for its own
// authorization decision.

import { cookies } from 'next/headers'
import { verifySessionToken, SESSION_COOKIE, type SessionPayload } from '@/lib/auth'
import { findById, type User } from '@/lib/users'

export async function getSession(): Promise<SessionPayload | null> {
  const secret = process.env.VMA_SESSION_SECRET || ''
  if (!secret) return null

  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return verifySessionToken(token, secret)
}

/**
 * The signed-in account as it exists in the store right now.
 *
 * Reading the store rather than trusting the token's claims means a deleted
 * account or a changed role takes effect immediately, instead of at the end of
 * the token's lifetime.
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession()
  if (!session) return null
  return findById(session.sub)
}

export interface AdminCheck {
  user: User | null
  /**
   * Set whenever the caller must be refused, and the only field a caller should
   * test. It is present for an anonymous request and for a signed-in non-admin,
   * so a `if (!check.user)` guard silently lets a normal account through.
   */
  error?: string
  status?: number
}

export async function requireAdmin(): Promise<AdminCheck> {
  const user = await getCurrentUser()
  if (!user) return { user: null, error: 'Unauthorized', status: 401 }
  if (user.role !== 'admin') return { user, error: 'Admin access required.', status: 403 }
  return { user }
}
