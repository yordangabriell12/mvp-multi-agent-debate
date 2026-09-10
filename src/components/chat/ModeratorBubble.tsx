import { formatTime } from '@/lib/utils'
import { renderMarkdown } from '@/lib/markdown'

interface ModeratorBubbleProps {
  content: string
  timestamp: number
}

export function ModeratorBubble({ content, timestamp }: ModeratorBubbleProps) {
  return (
    <div className="flex gap-3 animate-fade-up">
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 mt-0.5 bg-ink">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M3 20h18M6 20v-9l-2 1v-2l2-1V5c0-1 .5-2 2-2h4c1.5 0 2 1 2 2v4l2 1v2l-2-1v9M10 4v.01M14 10.5v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-medium text-ink">Moderator</span>
          <span className="text-[11px] uppercase tracking-wide text-ink-faint">Facilitator</span>
          <span className="text-[10px] text-ink-faint">{formatTime(timestamp)}</span>
        </div>
        <div className="text-sm text-ink leading-relaxed border-l-2 border-ink-faint/40 pl-3" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
      </div>
    </div>
  )
}
