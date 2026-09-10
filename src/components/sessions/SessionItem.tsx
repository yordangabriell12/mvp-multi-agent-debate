'use client'

import { useState, useRef, useEffect } from 'react'
import type { Session } from '@/types/session'
import type { Agent } from '@/types/agent'
import { useSessionStore } from '@/store/sessionStore'
import { cn, formatRelativeTime } from '@/lib/utils'

interface SessionItemProps {
  session: Session
  agents: Agent[]
  isActive: boolean
  onClick: () => void
}

export function SessionItem({ session, agents, isActive, onClick }: SessionItemProps) {
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [name, setName] = useState(session.name)
  const { renameSession, removeSession } = useSessionStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const agentNames = session.agentIds
    .map((id) => agents.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => a!.name)
    .join(', ')

  const handleRename = () => {
    if (name.trim() && name !== session.name) renameSession(session.id, name.trim())
    setEditing(false)
  }

  return (
    <div className={cn('relative group', isActive && 'bg-surface-hover rounded-lg')}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => { if (!editing) onClick() }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !editing) onClick() }}
        className="w-full text-left px-2.5 py-2 rounded-lg transition-colors cursor-pointer"
        onDoubleClick={() => { setEditing(true); setMenuOpen(false) }}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-2 h-2 rounded-full shrink-0',
              session.status === 'running' && 'bg-sage',
              session.status === 'paused' && 'bg-rust',
              session.status === 'idle' && 'bg-sand-400'
            )}
          />
          {editing ? (
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
                if (e.key === 'Escape') { setName(session.name); setEditing(false) }
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 text-xs font-medium text-ink bg-surface border border-border-strong rounded px-1.5 py-0.5 focus:outline-none"
            />
          ) : (
            <span className="text-xs font-medium text-ink truncate flex-1">{session.name}</span>
          )}
          {!editing && (
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
              className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-ink-muted hover:text-ink-muted hover:bg-surface-inset transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="3" r="1" fill="currentColor" />
                <circle cx="6" cy="6" r="1" fill="currentColor" />
                <circle cx="6" cy="9" r="1" fill="currentColor" />
              </svg>
            </button>
          )}
        </div>
        <div className="text-[11px] text-ink-muted mt-0.5 pl-4 truncate">
          {agentNames} · {formatRelativeTime(session.updatedAt)}
        </div>
      </div>

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-1 top-full z-50 w-36 bg-surface border border-border rounded-lg shadow-md py-1 animate-slide-in"
        >
          <button
            onClick={() => { setEditing(true); setMenuOpen(false) }}
            className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-hover transition-colors"
          >
            Rename
          </button>
          <button
            onClick={() => { setMenuOpen(false) }}
            className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-hover transition-colors"
          >
            Duplicate
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={() => { removeSession(session.id); setMenuOpen(false) }}
            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}