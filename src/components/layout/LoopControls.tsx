'use client'

import { useSessionStore } from '@/store/sessionStore'
import { cn } from '@/lib/utils'

interface LoopControlsProps {
  sessionId: string
  loading?: boolean
  loopRound?: number
  onStop?: () => void
}

export function LoopControls({ sessionId, loading, loopRound = 0, onStop }: LoopControlsProps) {
  const session = useSessionStore((s) => s.sessions.find((sess) => sess.id === sessionId))

  if (!session || (session.currentRound === 0 && !loading)) return null

  const isRunning = session.status === 'running' || loading
  const isPaused = session.status === 'paused'

  return (
    <div className="h-9 min-h-[36px] px-5 flex items-center gap-3 text-[11px] border-b border-border">
      <div className="flex items-center gap-2">
        {isRunning && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sage opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sage" />
          </span>
        )}
        {isPaused && (
          <span className="w-2 h-2 rounded-full bg-rust" />
        )}
        {!isRunning && !isPaused && (
          <span className="w-2 h-2 rounded-full bg-sand-400" />
        )}
        <span className="text-ink-muted">
          {isRunning ? 'Loop running' : isPaused ? 'Paused' : 'Idle'}
        </span>
      </div>

      <span className="font-mono text-ink-muted">
        round {loopRound > 0 ? loopRound : session.currentRound}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => {
            updateSessionStatus(session.id, session.status === 'paused' ? 'running' : 'paused')
          }}
          className={cn('px-2 py-0.5 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors', isPaused && 'text-sage')}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={onStop}
          className="px-2 py-0.5 rounded text-ink-muted hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          Stop
        </button>
      </div>
    </div>
  )
}

function updateSessionStatus(id: string, status: 'running' | 'paused') {
  useSessionStore.getState().updateSession(id, { status })
}