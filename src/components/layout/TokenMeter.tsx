'use client'

import { useChatStore } from '@/store/chatStore'
import { useSessionStore } from '@/store/sessionStore'

export function TokenMeter({ sessionId }: { sessionId?: string }) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sid = sessionId || activeSessionId
  const allMessages = useChatStore((s) => s.messages)
  const messages = sid ? allMessages[sid] || [] : []

  // Estimate tokens: ~4 chars per token for English
  let totalTokens = 0
  let totalCost = 0
  for (const msg of messages) {
    if (msg.metadata?.tokens) {
      totalTokens += msg.metadata.tokens
    } else {
      totalTokens += Math.ceil(msg.content.length / 4)
    }
    if (msg.metadata?.cost) {
      totalCost += msg.metadata.cost
    }
  }

  // Rough cost estimate: ~$0.002 per 1K tokens (average)
  if (totalCost === 0 && totalTokens > 0) {
    totalCost = (totalTokens / 1000) * 0.002
  }

  const tokenDisplay = totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : String(totalTokens)
  const costDisplay = totalCost > 0 ? `$${totalCost.toFixed(3)}` : '$0.00'

  return (
    <div className="h-8 min-h-[32px] px-5 flex items-center gap-4 text-[11px] text-ink-faint border-b border-border">
      <span className="flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        {tokenDisplay} tokens
      </span>
      <span className="w-px h-3 bg-border" />
      <span>~{costDisplay}</span>
      <span className="ml-auto text-[10px] opacity-60">
        {messages.length} messages
      </span>
    </div>
  )
}
