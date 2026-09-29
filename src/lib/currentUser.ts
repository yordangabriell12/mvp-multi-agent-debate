/** The account behind the current session, as the client sees it. */
export interface CurrentUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  /** True while the account still holds the password an admin handed over. */
  mustChangePassword: boolean
  /** True when this account owns the provider keys and may edit them. */
  isAdmin: boolean
  createdAt?: number
  lastLoginAt?: number
}

export interface MeResponse {
  user: CurrentUser
  /** The first-run walkthrough has been dismissed. */
  tourSeen: boolean
  /** How many providers have a key configured. */
  providersReady: number
}

/**
 * Fetches the signed-in account.
 *
 * The session cookie is HttpOnly, so this is the only way for the client to learn
 * who it is. Returns null rather than throwing, because every caller has a
 * sensible "not signed in" path: the proxy would already have redirected.
 */
export async function fetchMe(): Promise<MeResponse | null> {
  try {
    const res = await fetch('/api/me', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as MeResponse
  } catch {
    return null
  }
}
