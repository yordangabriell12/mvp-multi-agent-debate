'use client'

import { useSessionStore } from '@/store/sessionStore'
import { useAgentStore } from '@/store/agentStore'
import { cn, getInitials } from '@/lib/utils'

/**
 * Who is in the room, and the controls that shape the room itself.
 *
 * This lived in a second sidebar on the right, which took a fixed 288px from the
 * chat. Two panels competing for the same width made the chat the narrowest thing
 * on a screen whose whole point is reading the debate, so the right panel is gone
 * and its two tabs moved here, into one list beside the sessions.
 *
 * `onAdd`, `onKick` and `onInvite` are passed in rather than read from the stores,
 * because each one also writes a message into the session, so the room's history
 * shows who arrived and who left.
 */
interface RoomAgentsTabProps {
  onAdd: () => void
  onKick: (agentId: string) => void
  onInvite: (agentId: string) => void
}

interface AgentSummary {
  id: string
  name: string
  roleTitle: string
  avatarColor: string
  model: { modelName: string }
}

export function RoomAgentsTab({ onAdd, onKick, onInvite }: RoomAgentsTabProps) {
  const session = useSessionStore((s) => {
    const id = s.activeSessionId
    return s.sessions.find((sess) => sess.id === id)
  })
  const allAgents = useAgentStore((s) => s.agents)
  const setSettings = useSessionStore((s) => s.setSettings)

  const roomAgents = session ? allAgents.filter((a) => session.agentIds.includes(a.id)) : []
  const absent = session ? allAgents.filter((a) => !session.agentIds.includes(a.id)) : []
  const moderatorOn = session?.settings.moderatorEnabled === true

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
          In this room
        </span>
        <button
          onClick={onAdd}
          className="text-[11px] text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 rounded px-1 transition-colors"
        >
          + New
        </button>
      </div>

      {roomAgents.map((agent) => (
        <AgentRow key={agent.id} agent={agent}>
          <button
            onClick={() => onKick(agent.id)}
            aria-label={`Remove ${agent.name} from the room`}
            title={`Remove ${agent.name} from the room`}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 w-5 h-5 flex items-center justify-center rounded text-ink-muted hover:text-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 transition-all shrink-0"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </AgentRow>
      ))}

      {roomAgents.length === 0 && (
        <p className="text-xs text-ink-muted text-center py-4">No agents in this room</p>
      )}

      {absent.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted block mb-2">
            Not in the room
          </span>
          {absent.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg opacity-50 hover:opacity-80 transition-opacity"
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold text-white shrink-0"
                style={{ backgroundColor: agent.avatarColor }}
              >
                {getInitials(agent.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-ink-muted truncate">{agent.name}</div>
              </div>
              <button
                onClick={() => onInvite(agent.id)}
                aria-label={`Invite ${agent.name} back`}
                className="text-[10px] text-sage hover:text-ink px-1.5 py-0.5 rounded border border-sage/30 hover:border-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 transition-colors"
              >
                + invite
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted block mb-2">
          Room controls
        </span>
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="min-w-0">
            <span className="text-xs text-ink-muted block">Moderator</span>
            {/* A bare pill reads as decoration. The second line says what the switch
                actually changes, so it does not need to be guessed or toggled to find
                out. */}
            <span className="text-[10px] text-ink-muted">Writes the closing summary</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={moderatorOn}
            aria-label="Moderator writes the closing summary"
            disabled={!session}
            onClick={() => session && setSettings(session.id, { moderatorEnabled: !moderatorOn })}
            className={cn(
              'w-8 h-[18px] rounded-full transition-colors relative shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500',
              moderatorOn ? 'bg-sand-700' : 'bg-sand-300'
            )}
          >
            <span
              className={cn(
                'absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform shadow-sm',
                moderatorOn ? 'left-[14px]' : 'left-[2px]'
              )}
            />
          </button>
        </div>
      </div>
    </div>
  )
}

/** One seated agent. The action beside it is passed in, so kick and invite share this. */
function AgentRow({ agent, children }: { agent: AgentSummary; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-hover group transition-colors">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
        style={{ backgroundColor: agent.avatarColor }}
      >
        {getInitials(agent.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-ink truncate">{agent.name}</div>
        <div className="text-[11px] text-ink-muted truncate">{agent.roleTitle}</div>
      </div>
      {children}
    </div>
  )
}
