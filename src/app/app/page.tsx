'use client'

import { useSessionStore } from '@/store/sessionStore'
import { useEffect, useRef, useState } from 'react'
import { ChatArea } from '@/components/chat/ChatArea'
import { InputBar } from '@/components/input/InputBar'
import { Topbar } from '@/components/layout/Topbar'
import { TokenMeter } from '@/components/layout/TokenMeter'
import { LoopControls } from '@/components/layout/LoopControls'
import { useChat } from '@/hooks/useChat'

export default function AppPage() {
  const { sessions, activeSessionId, createSession } = useSessionStore()
  const createdRef = useRef(false)
  const [mounted, setMounted] = useState(false)
  const chat = useChat(activeSessionId || '')

  useEffect(() => {
    setMounted(true)
    if (!createdRef.current && sessions.length === 0) {
      createdRef.current = true
      createSession('Welcome Session')
    }
  }, [sessions.length, createSession])

  if (!mounted || !activeSessionId || sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-10 h-10 rounded-lg bg-sand-800 flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-sm font-semibold tracking-tight">V</span>
          </div>
          <h2 className="text-lg font-semibold text-ink mb-1">VMA Boardroom</h2>
          <p className="text-sm text-ink-muted mb-6">
            {mounted ? 'Create a session to start a multi-agent discussion.' : 'Loading\u2026'}
          </p>
        </div>
      </div>
    )
  }

  const session = sessions.find((s) => s.id === activeSessionId)

  return (
    <div className="flex-1 flex flex-col h-full">
      <Topbar
        title={session?.name || 'Session'}
        meta={session ? `${session.agentIds.length} agents \u00b7 round ${session.currentRound}` : undefined}
      />
      <TokenMeter />
      <LoopControls sessionId={activeSessionId} loading={chat.loading} loopRound={chat.loopRound} onStop={chat.stop} />
      <ChatArea sessionId={activeSessionId} streaming={chat.streaming} />
      <InputBar sessionId={activeSessionId} onSend={chat.sendMessage} loading={chat.loading} onStop={chat.stop} />
    </div>
  )
}