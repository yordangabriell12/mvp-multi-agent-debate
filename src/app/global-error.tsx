'use client'

// Catches errors thrown in the root layout itself, so it has to render its own
// <html> and <body> and cannot rely on globals.css being available.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafaf9',
          color: '#1a1816',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          padding: '2.5rem 1rem',
        }}
      >
        <div
          style={{
            maxWidth: '26rem',
            width: '100%',
            background: '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '12px',
            padding: '1.75rem',
          }}
        >
          <h1 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
            VMA could not start
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b6560', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
            The application failed to load. Reloading usually fixes it. Nothing stored in this
            browser has been lost.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: 'monospace',
                fontSize: '0.6875rem',
                color: '#6b6560',
                background: '#f5f5f4',
                border: '1px solid #e7e5e4',
                borderRadius: '6px',
                padding: '0.5rem 0.75rem',
                margin: '0 0 1rem',
                wordBreak: 'break-all',
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#ffffff',
              background: '#292524',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
