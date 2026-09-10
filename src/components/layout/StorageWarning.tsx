'use client'

import { useChatStore } from '@/store/chatStore'

/**
 * Surfaces a failed write to localStorage. Without this the app kept looking
 * healthy while messages quietly stopped being persisted.
 */
export function StorageWarning() {
  const error = useChatStore((s) => s.persistenceError)
  const dismiss = useChatStore((s) => s.dismissPersistenceError)

  if (!error) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-3 px-5 py-2.5 bg-rust-light border-b border-rust/30 text-xs text-ink"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-rust shrink-0 mt-0.5" aria-hidden="true">
        <path d="M8 5v4M8 11h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
      </svg>
      <span className="flex-1 leading-relaxed">{error}</span>
      <button
        onClick={dismiss}
        className="text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 rounded px-1 transition-colors shrink-0"
        aria-label="Dismiss storage warning"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
