'use client'

import { useState } from 'react'
import { improveText } from '@/lib/improveText'
import { cn } from '@/lib/utils'

interface ImproveButtonProps {
  /** Read lazily so the parent stays the owner of the text. */
  getText: () => string
  onImproved: (text: string) => void
  mode: 'chat' | 'persona'
  label?: string
  className?: string
}

/**
 * Rewrites the current text with the configured model. The result replaces the
 * text rather than being appended, so the control is a rewrite, not a suggestion
 * box; the caller keeps ownership of the value.
 */
export function ImproveButton({
  getText,
  onImproved,
  mode,
  label = 'Improve',
  className,
}: ImproveButtonProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    if (busy) return
    setError('')
    setBusy(true)
    const result = await improveText(getText(), mode)
    setBusy(false)

    if (result.ok && result.text) {
      onImproved(result.text)
      return
    }
    setError(result.error || 'Could not improve the text.')
  }

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        title="Rewrite this text with your configured model"
        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-ink-muted border border-border rounded-md hover:text-ink hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M8.5 2.5l3 3M1.5 10.5l.8-3.2L10 2.5l3 3-7.7 7.7-3.8.8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        {busy ? 'Improving...' : label}
      </button>
      {error && (
        <span role="status" className="text-[10px] text-rust">
          {error}
        </span>
      )}
    </span>
  )
}
