'use client'

export function SidebarFooterButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink hover:bg-surface-hover rounded-md transition-colors"
    >
      <span className="w-4 h-4 flex items-center justify-center opacity-50">{icon}</span>
      {label}
    </button>
  )
}

export function KeyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7.2 7.2l4.3 4.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9.5 7l1.3 1.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function PeopleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="5" cy="4" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 11.5c0-1.9 1.5-3.5 3.5-3.5s3.5 1.6 3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="9.5" cy="4.5" r="1.3" stroke="currentColor" strokeWidth="1.1" />
      <path d="M10 8c1.4.3 2.5 1.5 2.5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

export function CubeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5l5 2.5v6l-5 2.5-5-2.5v-6l5-2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M7 6.5v6.5M7 6.5L2 4M7 6.5l5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

export function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M8.5 2.5l3 3M1.5 10.5l.8-3.2L10 2.5l3 3-7.7 7.7-3.8.8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

export function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 1.5h5.5L11 4v8.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8.5 1.5V4h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5 7.5h4M5 9.5h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}