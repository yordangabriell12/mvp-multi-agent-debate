import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-raised px-4 py-10">
      <div className="w-full max-w-sm text-center animate-fade-up">
        <p className="text-[11px] font-mono text-ink-muted mb-2">404</p>
        <h1 className="text-base font-semibold text-ink">This page does not exist</h1>
        <p className="text-sm text-ink-muted mt-1 mb-6">
          The link may be outdated, or the session it pointed to was deleted.
        </p>
        <Link
          href="/app"
          className="inline-block px-4 py-2 text-sm font-medium text-white bg-sand-800 rounded-md hover:bg-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised transition-colors"
        >
          Back to workspace
        </Link>
      </div>
    </main>
  )
}
