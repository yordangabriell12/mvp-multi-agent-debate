import { formatTime } from '@/lib/utils'
import { renderMarkdown } from '@/lib/markdown'

interface ChatBubbleProps {
  name: string
  role: string
  color: string
  content: string
  timestamp: number
}

export function ChatBubble({ name, role, color, content, timestamp }: ChatBubbleProps) {
  return (
    <div className="flex gap-3 animate-fade-up">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 mt-0.5"
        style={{ backgroundColor: color }}
      >
        {name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-medium" style={{ color }}>{name}</span>
          <span className="text-[11px] text-ink-faint">{role}</span>
          <span className="text-[10px] text-ink-faint">{formatTime(timestamp)}</span>
        </div>
        <div className="text-sm text-ink leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
      </div>
    </div>
  )
}