'use client'

import { useState } from 'react'
import { useSessionStore } from '@/store/sessionStore'
import { useChatStore } from '@/store/chatStore'
import { PRESET_MODES, type PresetMode, type LoopSpeed } from '@/types/session'
import { cn } from '@/lib/utils'

const SPEED_OPTIONS: { value: LoopSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
]

const ROUND_OPTIONS: { value: number | 'unlimited'; label: string }[] = [
  { value: 3, label: '3' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 'unlimited', label: 'Unlimited' },
]

export function ModeTab() {
  const session = useSessionStore((s) => {
    const id = s.activeSessionId
    return s.sessions.find((sess) => sess.id === id)
  })
  const updateSession = useSessionStore((s) => s.updateSession)
  const setSettings = useSessionStore((s) => s.setSettings)
  const addMessage = useChatStore((s) => s.addMessage)
  const [openDropdown, setOpenDropdown] = useState<'speed' | 'rounds' | null>(null)

  if (!session) return null

  return (
    <div className="p-3 space-y-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted block mb-2">
        Preset Mode
      </span>
      {Object.entries(PRESET_MODES).map(([key, mode]) => {
        const presetKey = key as PresetMode
        const isActive = session.presetMode === presetKey
        return (
          <button
            key={key}
            onClick={() => {
              updateSession(session.id, { presetMode: presetKey })
              // Auto-adjust settings based on preset mode
              const presetSettings: Record<string, Partial<{ loopSpeed: 'slow' | 'normal' | 'fast'; maxRounds: number | 'unlimited' }>> = {
                boardroom: { loopSpeed: 'normal', maxRounds: 2 },
                supportive: { loopSpeed: 'slow', maxRounds: 3 },
                learning: { loopSpeed: 'slow', maxRounds: 3 },
                war: { loopSpeed: 'fast', maxRounds: 1 },
                custom: { loopSpeed: 'normal', maxRounds: 'unlimited' },
              }
              const ps = presetSettings[presetKey]
              if (ps) setSettings(session.id, { loopSpeed: ps.loopSpeed as 'slow' | 'normal' | 'fast', maxRounds: ps.maxRounds })
              // Show system message
              const modeLabel = PRESET_MODES[presetKey]?.label || presetKey
              addMessage(session.id, { role: 'system', content: '⚙️ Mode changed to ' + modeLabel + ' — ' + PRESET_MODES[presetKey]?.description, sessionId: session.id })
            }}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-lg border transition-colors',
              isActive ? 'border-sand-700 bg-surface' : 'border-border hover:border-border-strong hover:bg-surface-hover'
            )}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm">{mode.icon}</span>
              <span className={cn('text-xs font-medium', isActive ? 'text-ink' : 'text-ink-light')}>{mode.label}</span>
            </div>
            <p className="text-[11px] text-ink-muted leading-relaxed pl-6">{mode.description}</p>
          </button>
        )
      })}

      <div className="mt-4 pt-3 border-t border-border">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted block mb-2">Loop Settings</span>
        <div className="space-y-1">
          {/* Speed dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'speed' ? null : 'speed')}
              className="w-full flex items-center justify-between py-2 px-2 rounded-md hover:bg-surface-hover transition-colors"
            >
              <span className="text-xs text-ink-muted">Speed</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-ink-light capitalize">{session.settings.loopSpeed}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-ink-muted">
                  <path d="M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>
            {openDropdown === 'speed' && (
              <div className="absolute left-0 right-0 top-full z-10 bg-surface border border-border rounded-lg shadow-md py-1 animate-slide-in">
                {SPEED_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSettings(session.id, { loopSpeed: opt.value }); setOpenDropdown(null) }}
                    className={cn('w-full text-left px-3 py-1.5 text-xs transition-colors', session.settings.loopSpeed === opt.value ? 'text-ink bg-surface-hover font-medium' : 'text-ink-muted hover:text-ink hover:bg-surface-hover')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Max Rounds dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'rounds' ? null : 'rounds')}
              className="w-full flex items-center justify-between py-2 px-2 rounded-md hover:bg-surface-hover transition-colors"
            >
              <span className="text-xs text-ink-muted">Max Rounds</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-ink-light">{session.settings.maxRounds === 'unlimited' ? 'Unlimited' : session.settings.maxRounds}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-ink-muted">
                  <path d="M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>
            {openDropdown === 'rounds' && (
              <div className="absolute left-0 right-0 top-full z-10 bg-surface border border-border rounded-lg shadow-md py-1 animate-slide-in">
                {ROUND_OPTIONS.map((opt) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => { setSettings(session.id, { maxRounds: opt.value }); setOpenDropdown(null) }}
                    className={cn('w-full text-left px-3 py-1.5 text-xs transition-colors', session.settings.maxRounds === opt.value ? 'text-ink bg-surface-hover font-medium' : 'text-ink-muted hover:text-ink hover:bg-surface-hover')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}