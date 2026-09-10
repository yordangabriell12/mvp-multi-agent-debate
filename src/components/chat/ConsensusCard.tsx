export function ConsensusCard() {
  return (
    <div className="border border-border rounded-lg bg-surface-raised p-4 my-4 animate-fade-up">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-3">
        Consensus Check
      </div>
      <div className="space-y-2">
        <ConsensusRow name="Maya" color="#4a7c59" from="Progresif" to="Conditional" matched />
        <ConsensusRow name="Aldo" color="#b45309" from="Reject" to="Conditional" matched />
        <ConsensusRow name="Sinta" color="#475569" from="Full review" to="Low risk" matched />
      </div>
      <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-sage">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4.5 7l1.5 1.5 3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-xs text-ink-muted">Positions converging — continue or stop?</span>
      </div>
    </div>
  )
}

function ConsensusRow({
  name,
  color,
  from,
  to,
  matched,
}: {
  name: string
  color: string
  from: string
  to: string
  matched: boolean
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="font-medium w-16 shrink-0" style={{ color }}>{name}</span>
      <span className="text-ink-muted line-through">{from}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-ink-muted shrink-0">
        <path d="M4 6h4M6.5 4l2 2-2 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-ink-light">{to}</span>
      {matched && (
        <span className="ml-auto text-sage">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 6l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </div>
  )
}