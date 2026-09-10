'use client'

import { useChatStore } from '@/store/chatStore'
import { useSessionStore } from '@/store/sessionStore'
import { useAgentStore } from '@/store/agentStore'

interface TopbarProps {
  title: string
  meta?: string
}

export function Topbar({ title, meta }: TopbarProps) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const allMessages = useChatStore((s) => s.messages)
  const messages = allMessages[activeSessionId || ''] || []
  const agents = useAgentStore((s) => s.agents)

  const handleExport = () => {
    let md = '# ' + title + '\n\n'
    for (const msg of messages) {
      if (msg.role === 'user') {
        md += '**You:** ' + msg.content + '\n\n'
      } else if (msg.role === 'agent') {
        const agent = agents.find((a) => a.id === msg.agentId)
        md += '**' + (agent?.name || 'Agent') + ':** ' + msg.content + '\n\n'
      } else if (msg.role === 'system') {
        md += '> ' + msg.content + '\n\n'
      } else if (msg.role === 'moderator') {
        md += '**Moderator:** ' + msg.content + '\n\n'
      }
    }
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = title.replace(/[^a-zA-Z0-9]/g, '_') + '.md'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-12 min-h-[48px] px-5 flex items-center justify-between border-b border-border">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-sm font-semibold text-ink truncate">{title}</h1>
        {meta && (
          <span className="text-xs text-ink-faint shrink-0">{meta}</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button className="px-2.5 py-1 text-xs text-ink-muted hover:text-ink hover:bg-surface-hover rounded-md transition-colors">
          Share
        </button>
        <button onClick={handleExport} className="px-2.5 py-1 text-xs text-ink-muted hover:text-ink hover:bg-surface-hover rounded-md transition-colors">
          Export
        </button>
      </div>
    </div>
  )
}