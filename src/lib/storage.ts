// localStorage helpers that report failure instead of swallowing it.
//
// localStorage holds roughly 5 MB. A long debate eventually exceeds that, and
// the previous code caught the error and carried on, so messages silently
// stopped being saved while the UI still looked healthy.

export interface SaveResult {
  ok: boolean
  error?: string
}

/**
 * Names of the persisted keys, in one place. The config sync module reads and
 * writes the same keys during hydration, so a typo here would silently split
 * local state from synced state.
 */
export const STORAGE_KEYS = {
  providers: 'vma-providers',
  moderator: 'vma-moderator',
  agents: 'vma-agents',
  sessions: 'vma-sessions',
  activeSession: 'vma-active-session',
  messages: 'vma-messages',
} as const

export function safeSetItem(key: string, value: string): SaveResult {
  if (typeof window === 'undefined') return { ok: true }
  try {
    localStorage.setItem(key, value)
    return { ok: true }
  } catch (err) {
    const quotaExceeded =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return {
      ok: false,
      error: quotaExceeded
        ? 'Browser storage is full, so this change was not saved. Export the session and delete old ones to free space.'
        : 'Browser storage is unavailable, so this change was not saved.',
    }
  }
}

export function safeRemoveItem(key: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing useful to do: the entry is unreachable either way.
  }
}

export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
