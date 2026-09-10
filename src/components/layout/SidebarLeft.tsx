'use client'

import { useState, useEffect } from 'react'
import { useSessionStore } from '@/store/sessionStore'
import { useAgentStore } from '@/store/agentStore'
import { useModalStore } from '@/store/modalStore'
import { SessionItem } from '@/components/sessions/SessionItem'
import { cn } from '@/lib/utils'
import { SidebarFooterButton, KeyIcon, PeopleIcon, CubeIcon, EditIcon, DocIcon, ExitIcon } from './SidebarIcons'

export function SidebarLeft() {
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { sessions, activeSessionId, setActiveSession, createSession } = useSessionStore()
  const agents = useAgentStore((s) => s.agents)
  const openModal = useModalStore((s) => s.openModal)

  useEffect(() => { setMounted(true) }, [])

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch { /* clear the cookie via redirect anyway */ }
    window.location.assign('/login')
  }

  return (
    <>
      <aside
        className={cn(
          'h-screen bg-surface-raised border-r border-border flex flex-col transition-all duration-300 ease-out',
          collapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'w-60 min-w-60'
        )}
      >
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-sand-800 flex items-center justify-center">
              <span className="text-white text-[10px] font-bold tracking-tight">V</span>
            </div>
            <span className="text-xs font-semibold text-ink tracking-tight">VMA</span>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="w-6 h-6 flex items-center justify-center rounded text-ink-muted hover:text-ink-muted hover:bg-surface-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="px-3 pb-2">
          <button
            onClick={() => createSession(`Session ${sessions.length + 1}`)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            New session
          </button>
        </div>

        <div className="px-3 mb-1">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Recent</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {mounted ? (
            <>
              {sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  agents={agents}
                  isActive={session.id === activeSessionId}
                  onClick={() => setActiveSession(session.id)}
                />
              ))}
              {sessions.length === 0 && (
                <p className="px-2 py-6 text-xs text-ink-muted text-center">No sessions yet</p>
              )}
            </>
          ) : (
            <p className="px-2 py-6 text-xs text-ink-muted text-center">No sessions yet</p>
          )}
        </div>

        <div className="px-2 pb-3 border-t border-border pt-2 flex flex-col gap-0.5">
          <SidebarFooterButton icon={<KeyIcon />} label="API Keys" onClick={() => openModal('apiKeys')} />
          <SidebarFooterButton icon={<PeopleIcon />} label="Manage Agents" onClick={() => openModal('agents')} />
          <SidebarFooterButton icon={<CubeIcon />} label="AI Models" onClick={() => openModal('models')} />
          <SidebarFooterButton icon={<EditIcon />} label="Agent Roles" onClick={() => openModal('roles')} />
          <div className="border-t border-border my-1" />
          <SidebarFooterButton icon={<DocIcon />} label="Knowledge Base" onClick={() => openModal('documents')} />
          <SidebarFooterButton icon={<ExitIcon />} label="Sign out" onClick={handleSignOut} />
        </div>
      </aside>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="fixed left-2 top-1/2 -translate-y-1/2 z-50 w-7 h-12 bg-surface-raised border border-border rounded-lg flex items-center justify-center text-ink-muted hover:text-ink-muted hover:bg-surface-hover transition-colors shadow-sm"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </>
  )
}