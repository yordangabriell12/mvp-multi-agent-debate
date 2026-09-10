'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useSessionStore } from '@/store/sessionStore'
import { ChatArea } from '@/components/chat/ChatArea'
import { InputBar } from '@/components/input/InputBar'
import { Topbar } from '@/components/layout/Topbar'
import { TokenMeter } from '@/components/layout/TokenMeter'
import { LoopControls } from '@/components/layout/LoopControls'
import { useChat } from '@/hooks/useChat'

export default function RoomPage() {
  const params = useParams()
  const id = params.id as string
  const { sessions, setActiveSession } = useSessionStore()
  const chat = useChat(id || '')

  useEffect(() => {
    if (id) setActiveSession(id)
  }, [id, setActiveSession])

  const session = sessions.find((s) => s.id === id)

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-ink-muted">
        Session not found.
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <Topbar
        title={session.name}
        meta={`${session.agentIds.length} agents \u00b7 round ${session.currentRound}`}
      />
      <TokenMeter />
      <LoopControls sessionId={id} loading={chat.loading} loopRound={chat.loopRound} onStop={chat.stop} />
      <ChatArea sessionId={id} streaming={chat.streaming} />
      <InputBar sessionId={id} onSend={chat.sendMessage} loading={chat.loading} onStop={chat.stop} />
    </div>
  )
}