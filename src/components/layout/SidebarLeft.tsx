'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSessionStore } from '@/store/sessionStore'
import { useAgentStore } from '@/store/agentStore'
import { useModalStore } from '@/store/modalStore'
import { useUiStore } from '@/store/uiStore'
import { useChatStore } from '@/store/chatStore'
import { useOnboardingStore } from '@/store/onboardingStore'
import { SessionItem } from '@/components/sessions/SessionItem'
import { RoomAgentsTab } from './RoomAgentsTab'
import { ModeTab } from './ModeTab'
import { cn } from '@/lib/utils'
import { SidebarFooterButton, KeyIcon, PeopleIcon, CubeIcon, EditIcon, DocIcon, ScanIcon, ShieldIcon, HelpIcon, ExitIcon } from './SidebarIcons'

/**
 * The three things this column can show.
 *
 * Sessions, agents and mode used to be split across two sidebars, one on each edge,
 * with the chat squeezed between them. Both panels were made of the same material and
 * competed for the same width, so the reading area ended up the narrowest thing on a
 * screen whose entire purpose is reading. They are tabs of one column now.
 */
type Tab = 'sessions' | 'agents' | 'mode'

const TABS: { id: Tab; label: string }[] = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'agents', label: 'Agents' },
  { id: 'mode', label: 'Mode' },
]

export function SidebarLeft() {
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('sessions')
  const { sessions, activeSessionId, setActiveSession, createSession } = useSessionStore()
  const agents = useAgentStore((s) => s.agents)
  const openModal = useModalStore((s) => s.openModal)
  const isAdmin = useUiStore((s) => s.isAdmin)
  const accountReady = useUiStore((s) => s.ready)
  const startTour = useOnboardingStore((s) => s.start)
  const kickAgent = useSessionStore((s) => s.kickAgent)
  const inviteAgent = useSessionStore((s) => s.inviteAgent)
  const addMessage = useChatStore((s) => s.addMessage)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  /**
   * Removing or re-seating an agent also writes a line into the session.
   *
   * Without the line the transcript would show an agent falling silent with no record
   * of why, which reads as a broken room rather than a decision someone made.
   */
  const kick = (agentId: string) => {
    const session = sessions.find((s) => s.id === activeSessionId)
    if (!session) return
    const agent = agents.find((a) => a.id === agentId)
    kickAgent(session.id, agentId)
    if (agent) {
      addMessage(session.id, {
        role: 'system',
        content: `${agent.name} was removed from the room`,
        sessionId: session.id,
      })
    }
  }

  const invite = (agentId: string) => {
    const session = sessions.find((s) => s.id === activeSessionId)
    if (!session) return
    const agent = agents.find((a) => a.id === agentId)
    inviteAgent(session.id, agentId)
    if (agent) {
      addMessage(session.id, {
        role: 'system',
        content: `${agent.name} has been invited back`,
        sessionId: session.id,
      })
    }
  }

  /**
   * Picks a session, and makes sure the session is actually visible.
   *
   * On `/app` the store change is enough, because that page renders whatever session
   * is active. On a nested page such as `/app/admin/users` it is not: the session
   * changed silently and the screen stayed on the admin list, so the button looked
   * dead. The sidebar is shared by every page under `/app`, which is why it cannot
   * tell "switch the session" from "leave this screen" on its own.
   */
  const selectSession = (id: string) => {
    setActiveSession(id)
    if (pathname !== '/app') router.push('/app')
  }

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
            aria-label="Collapse the sidebar"
            title="Collapse the sidebar"
            className="w-6 h-6 flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="px-3 pb-2">
          <button
            onClick={() => { createSession(`Session ${sessions.length + 1}`); setActiveTab('sessions') }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink bg-surface hover:bg-surface-hover border border-border rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            New session
          </button>
        </div>

        {/* Three tabs rather than three stacked sections. Stacking them would put the
            session list, the seating chart and the mode controls in one column at once,
            which is the same crowding that made the chat narrow in the first place. */}
        <div className="flex border-y border-border" role="tablist" aria-label="Sidebar sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sand-500',
                activeTab === tab.id
                  ? 'text-ink border-ink'
                  : 'text-ink-muted border-transparent hover:text-ink-light'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'sessions' && (
            <div className="px-2 pt-2">
              {mounted ? (
                <>
                  {sessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      agents={agents}
                      isActive={session.id === activeSessionId}
                      onClick={() => selectSession(session.id)}
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
          )}

          {/* Both of these read the active session, so they render only after mount:
              the server has no session to draw and anything rendered there would be
              replaced on the first client paint. */}
          {activeTab === 'agents' && mounted && (
            <RoomAgentsTab
              onAdd={() => openModal('agents')}
              onKick={kick}
              onInvite={invite}
            />
          )}
          {activeTab === 'mode' && mounted && <ModeTab />}
        </div>

        <div className="px-2 pb-3 border-t border-border pt-2 flex flex-col gap-0.5">
          {/* API Keys holds the shared credentials, so only the account that owns
              them is offered the screen. A non-admin would see an empty form and
              could not save it anyway; the route checks the role regardless. */}
          {accountReady && isAdmin && (
            <SidebarFooterButton icon={<KeyIcon />} label="API Keys" onClick={() => openModal('apiKeys')} />
          )}
          <SidebarFooterButton icon={<PeopleIcon />} label="Manage Agents" onClick={() => openModal('agents')} />
          <SidebarFooterButton icon={<CubeIcon />} label="AI Models" onClick={() => openModal('models')} />
          <SidebarFooterButton icon={<EditIcon />} label="Agent Roles" onClick={() => openModal('roles')} />
          <div className="border-t border-border my-1" />
          <SidebarFooterButton icon={<DocIcon />} label="Knowledge Base" onClick={() => openModal('documents')} />
          {/* Reading a PDF or an image runs on the shared provider key, so this is
              admin-only for the same reason API Keys is. Without it the feature
              cannot be switched on at all, and the upload screen would name a
              screen that does not exist. */}
          {accountReady && isAdmin && (
            <SidebarFooterButton icon={<ScanIcon />} label="Reading Documents" onClick={() => openModal('ocr')} />
          )}
          {accountReady && isAdmin && (
            <Link
              href="/app/admin/users"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors"
            >
              <ShieldIcon />
              Kelola Akun
            </Link>
          )}
          <SidebarFooterButton icon={<HelpIcon />} label="Panduan" onClick={startTour} />
          <SidebarFooterButton icon={<ExitIcon />} label="Sign out" onClick={handleSignOut} />
        </div>
      </aside>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Expand the sidebar"
          title="Expand the sidebar"
          className="fixed left-2 top-1/2 -translate-y-1/2 z-50 w-7 h-12 bg-surface-raised border border-border rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 transition-colors shadow-sm"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </>
  )
}