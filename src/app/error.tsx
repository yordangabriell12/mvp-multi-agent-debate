'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('VMA route error:', error)
  }, [error])

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-raised px-4 py-10">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl p-7 animate-fade-up">
        <div className="w-9 h-9 rounded-lg bg-rust flex items-center justify-center mb-5">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
            <path d="M8 5v4M8 11h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </div>

        <h1 className="text-base font-semibold text-ink">Something broke</h1>
        <p className="text-sm text-ink-muted mt-1 mb-5">
          This screen failed to render. Your conversations are stored in the browser, so they are
          not affected.
        </p>

        {error.digest && (
          <p className="text-[11px] font-mono text-ink-muted bg-surface-inset border border-border rounded-md px-3 py-2 mb-4 break-all">
            ref: {error.digest}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-medium text-white bg-sand-800 rounded-md hover:bg-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors"
          >
            Try again
          </button>
          <a
            href="/app"
            className="px-4 py-2 text-sm text-ink-muted border border-border rounded-md hover:text-ink hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 transition-colors"
          >
            Back to workspace
          </a>
        </div>
      </div>
    </main>
  )
}
