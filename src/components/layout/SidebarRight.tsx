'use client'

import { useState, useEffect } from 'react'
import { useSessionStore } from '@/store/sessionStore'
import { useAgentStore } from '@/store/agentStore'
import { useModalStore } from '@/store/modalStore'
import { useChatStore } from '@/store/chatStore'
import { cn, getInitials } from '@/lib/utils'
import { ModeTab } from './ModeTab'

type Tab = 'agents' | 'mode'

export function SidebarRight() {
  const [activeTab, setActiveTab] = useState<Tab>('agents')
  const [mounted, setMounted] = useState(false)
  const session = useSessionStore((s) => { const id = s.activeSessionId; return s.sessions.find((sess) => sess.id === id) })
  const agents = useAgentStore((s) => s.agents)
  const openModal = useModalStore((s) => s.openModal)
  const kickAgent = useSessionStore((s) => s.kickAgent)
  const inviteAgent = useSessionStore((s) => s.inviteAgent)
  const addMessage = useChatStore((s) => s.addMessage)
  const setSettings = useSessionStore((s) => s.setSettings)

  const roomAgents = session ? agents.filter((a) => session.agentIds.includes(a.id)) : []
  const sessionAgentIds = session?.agentIds || []

  useEffect(() => { setMounted(true) }, [])

  return (
    <aside className="w-72 min-w-72 h-screen bg-surface-raised border-l border-border flex flex-col">
      <div className="flex border-b border-border">
        {(['agents', 'mode'] as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={cn('flex-1 py-2.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px', activeTab === tab ? 'text-ink border-ink' : 'text-ink-muted border-transparent hover:text-ink-light')}>{tab}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'agents' ? (mounted ? (
          <AgentsTab agents={roomAgents} allAgents={agents} sessionAgentIds={sessionAgentIds} sessionId={session?.id || ''}
            onKick={(aid) => { if (!session) return; const a = agents.find((x) => x.id === aid); kickAgent(session.id, aid); if (a) addMessage(session.id, { role: 'system', content: a.name + ' was removed from the room', sessionId: session.id }) }}
            onInvite={(aid) => { if (!session) return; const a = agents.find((x) => x.id === aid); inviteAgent(session.id, aid); if (a) addMessage(session.id, { role: 'system', content: a.name + ' has been invited back', sessionId: session.id }) }}
            onAddAgent={() => openModal('agents')} />
        ) : null) : (mounted ? <ModeTab /> : null)}
      </div>
      <div className="px-3 py-3 border-t border-border flex gap-2">
        <button className="flex-1 px-3 py-1.5 text-[11px] text-ink-muted hover:text-ink hover:bg-surface-hover border border-border rounded-lg transition-colors">Share Room</button>
        <button className="flex-1 px-3 py-1.5 text-[11px] text-ink-muted hover:text-ink hover:bg-surface-hover border border-border rounded-lg transition-colors">Export</button>
      </div>
    </aside>
  )
}

function AgentsTab({ agents, allAgents, sessionAgentIds, sessionId, onKick, onInvite, onAddAgent }: {
  agents: { id: string; name: string; roleTitle: string; avatarColor: string; model: { modelName: string } }[]
  allAgents: { id: string; name: string; roleTitle: string; avatarColor: string; model: { modelName: string } }[]
  sessionAgentIds: string[]
  sessionId: string
  onKick: (agentId: string) => void
  onInvite: (agentId: string) => void
  onAddAgent: () => void
}) {
  const setSettings = useSessionStore((s) => s.setSettings)
  const sess = useSessionStore((s) => s.sessions.find((s) => s.id === sessionId))
  const kickedAgents = allAgents.filter((a) => !sessionAgentIds.includes(a.id))
  const modEnabled = sess?.settings.moderatorEnabled ?? false

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Room Agents</span>
        <button onClick={onAddAgent} className="text-[11px] text-ink-muted hover:text-ink transition-colors">+ Add</button>
      </div>
      {agents.map((agent) => (
        <div key={agent.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-hover group transition-colors">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0" style={{ backgroundColor: agent.avatarColor }}>{getInitials(agent.name)}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-ink truncate">{agent.name}</div>
            <div className="text-[11px] text-ink-faint truncate">{agent.roleTitle}</div>
          </div>
          <div className="text-[10px] text-ink-faint shrink-0">{agent.model.modelName}</div>
          <button onClick={() => onKick(agent.id)} className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-ink-faint hover:text-red-600 hover:bg-red-50 transition-all shrink-0" title={'Kick ' + agent.name}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
          </button>
        </div>
      ))}
      {agents.length === 0 && <p className="text-xs text-ink-faint text-center py-4">No agents in this room</p>}
      {kickedAgents.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint block mb-2">Not in room</span>
          {kickedAgents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg opacity-50 hover:opacity-80 transition-opacity">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold text-white shrink-0" style={{ backgroundColor: agent.avatarColor }}>{agent.name[0]}</div>
              <div className="flex-1 min-w-0"><div className="text-[11px] text-ink-muted truncate">{agent.name}</div></div>
              <button onClick={() => onInvite(agent.id)} className="text-[10px] text-sage hover:text-ink px-1.5 py-0.5 rounded border border-sage/30 hover:border-ink-faint transition-colors">+ invite</button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 pt-3 border-t border-border">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint block mb-2">Controls</span>
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-ink-muted">Moderator</span>
          <button
            onClick={() => sess && setSettings(sess.id, { moderatorEnabled: !modEnabled })}
            className={cn('w-8 h-[18px] rounded-full transition-colors relative', modEnabled ? 'bg-sand-700' : 'bg-sand-300')}
          ><span className={cn('absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform shadow-sm', modEnabled ? 'left-[14px]' : 'left-[2px]')} /></button>
        </div>
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-ink-muted">Role Lock</span>
          <button
            onClick={() => sess && setSettings(sess.id, { roleLock: !sess.settings.roleLock })}
            className={cn('w-8 h-[18px] rounded-full transition-colors relative', sess?.settings.roleLock ? 'bg-sand-700' : 'bg-sand-300')}
          ><span className={cn('absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform shadow-sm', sess?.settings.roleLock ? 'left-[14px]' : 'left-[2px]')} /></button>
        </div>
      </div>
    </div>
  )
}
