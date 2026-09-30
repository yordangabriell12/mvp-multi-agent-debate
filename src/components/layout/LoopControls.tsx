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
  const setSettings = useSessionStore((s) => s.setSettings)

  if (!session) return null

  const isRunning = session.status === 'running' || loading
  const isPaused = session.status === 'paused'
  const deepSearch = session.settings.deepSearch === true

  return (
    <div className="h-9 min-h-[36px] px-5 flex items-center gap-3 text-[11px] border-b border-border">
      <div className="flex items-center gap-2">
        {isRunning && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sage opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sage" />
          </span>
        )}
        {isPaused && <span className="w-2 h-2 rounded-full bg-rust" />}
        {!isRunning && !isPaused && <span className="w-2 h-2 rounded-full bg-sand-400" />}
        <span className="text-ink-muted">
          {isRunning ? 'Loop running' : isPaused ? 'Paused' : 'Idle'}
        </span>
      </div>

      <span className="font-mono text-ink-muted">
        round {loopRound > 0 ? loopRound : session.currentRound}
      </span>

      {/* Read from the session and written straight back, so flipping it mid-run
          only affects the turns that come after. The switch is never disabled by
          a run in progress: being able to change your mind while agents are
          working is the point. */}
      <button
        type="button"
        onClick={() => setSettings(session.id, { deepSearch: !deepSearch })}
        aria-pressed={deepSearch}
        title="Setiap agen mencari sendiri di web sebelum menjawab, dengan kata kunci yang berbeda supaya hasilnya tidak tumpang tindih"
        className={cn(
          'flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors',
          deepSearch
            ? 'border-sage/50 bg-sage-light text-sage'
            : 'border-border text-ink-muted hover:text-ink hover:bg-surface-hover'
        )}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <circle cx="5.2" cy="5.2" r="3.4" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7.8 7.8L10.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        Search Mode {deepSearch ? 'on' : 'off'}
      </button>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() =>
            useSessionStore
              .getState()
              .updateSession(session.id, { status: isPaused ? 'running' : 'paused' })
          }
          className={cn(
            'px-2 py-0.5 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors',
            isPaused && 'text-sage'
          )}
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
