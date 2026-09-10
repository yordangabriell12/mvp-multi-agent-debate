export function SystemMessage({ content }: { content: string }) {
  return (
    <div className="text-center py-2">
      <span className="text-xs text-ink-faint bg-surface-inset px-3 py-1 rounded-full">
        {content}
      </span>
    </div>
  )
}