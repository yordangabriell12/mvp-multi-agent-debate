'use client'

import { useChatStore } from '@/store/chatStore'
import { useSessionStore } from '@/store/sessionStore'

export function TokenMeter({ sessionId }: { sessionId?: string }) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sid = sessionId || activeSessionId
  const allMessages = useChatStore((s) => s.messages)
  const messages = sid ? allMessages[sid] || [] : []

  // Token count is an estimate, flagged as such. It is never presented as a
  // billed figure: only real usage reported by a provider would justify that.
  let totalTokens = 0
  let hasReportedUsage = false
  for (const msg of messages) {
    if (msg.metadata?.tokens) {
      totalTokens += msg.metadata.tokens
      hasReportedUsage = true
    } else {
      totalTokens += Math.ceil(msg.content.length / 4)
    }
  }

  const tokenDisplay = totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : String(totalTokens)

  return (
    <div className="h-8 min-h-[32px] px-5 flex items-center gap-4 text-[11px] text-ink-muted border-b border-border">
      <span
        className="flex items-center gap-1.5"
        title={
          hasReportedUsage
            ? 'Token count, partly reported by the provider and partly estimated'
            : 'Approximate token count, estimated from message length'
        }
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        {hasReportedUsage ? tokenDisplay : `~${tokenDisplay}`} tokens
      </span>
      <span className="w-px h-3 bg-border" aria-hidden="true" />
      <span className="text-ink-muted">
        {messages.length} {messages.length === 1 ? 'message' : 'messages'}
      </span>
      <span className="ml-auto text-[10px] text-ink-muted">
        Billing is shown by your provider, not here
      </span>
    </div>
  )
}
