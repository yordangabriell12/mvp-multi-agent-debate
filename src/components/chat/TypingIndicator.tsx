interface TypingIndicatorProps {
  name: string
  color: string
  status?: string
  icon?: 'agent' | 'moderator'
}

export function TypingIndicator({ name, color, status, icon = 'agent' }: TypingIndicatorProps) {
  return (
    <div className="flex gap-3 animate-fade-up">
      {icon === 'moderator' ? (
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 mt-0.5 bg-ink">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M3 20h18M6 20v-9l-2 1v-2l2-1V5c0-1 .5-2 2-2h4c1.5 0 2 1 2 2v4l2 1v2l-2-1v9M10 4v.01M14 10.5v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ) : (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 mt-0.5"
          style={{ backgroundColor: color }}
        >
          {name[0]}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-medium" style={icon === 'moderator' ? {} : { color }}>{name}</span>
          <span className="text-[10px] text-ink-faint italic">{status || 'thinking'}</span>
        </div>
        <div className="flex items-center gap-1.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-ink-faint animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-ink-faint animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-ink-faint animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}
