'use client'

import { useState } from 'react'

interface HTMLPreviewProps {
  html: string
  title?: string
  height?: number
}

export function HTMLPreview({ html, title = 'Preview', height = 400 }: HTMLPreviewProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview')
  const [fullScreen, setFullScreen] = useState(false)

  return (
    <div className={`rounded-lg border border-[var(--color-border)] overflow-hidden my-3 ${fullScreen ? 'fixed inset-4 z-50' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f8f9fa] border-b border-[var(--color-border)]">
        <span className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase">🌐 {title}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('preview')}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors ${viewMode === 'preview' ? 'bg-[var(--color-ink)] text-white' : 'bg-[var(--color-surface-hover)] text-[var(--color-ink-muted)]'}`}
          >
            Preview
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors ${viewMode === 'code' ? 'bg-[var(--color-ink)] text-white' : 'bg-[var(--color-surface-hover)] text-[var(--color-ink-muted)]'}`}
          >
            Code
          </button>
          <button
            onClick={() => setFullScreen(!fullScreen)}
            className="px-2 py-0.5 text-[10px] rounded bg-[var(--color-surface-hover)] text-[var(--color-ink-muted)] hover:bg-[var(--color-ink)] hover:text-white transition-colors"
          >
            {fullScreen ? '✕ Close' : '⤢ Expand'}
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'preview' ? (
        <iframe
          // srcDoc rather than writing into contentDocument: that way the frame
          // needs no same-origin access. The sandbox deliberately omits
          // allow-same-origin, because allow-scripts plus allow-same-origin lets
          // the frame remove its own sandbox attribute and reach the app origin.
          srcDoc={html}
          className="w-full bg-white border-0"
          style={{ height: fullScreen ? 'calc(100vh - 40px)' : height }}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="max-h-[400px] overflow-auto bg-[#1e1e2e] p-3">
          <pre className="text-xs font-mono text-[#cdd6f4] whitespace-pre-wrap">{html}</pre>
        </div>
      )}
    </div>
  )
}
