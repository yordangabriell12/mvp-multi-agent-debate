'use client'

import { useState, useRef, useEffect } from 'react'

interface HTMLPreviewProps {
  html: string
  title?: string
  height?: number
}

export function HTMLPreview({ html, title = 'Preview', height = 400 }: HTMLPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview')
  const [fullScreen, setFullScreen] = useState(false)

  useEffect(() => {
    if (iframeRef.current && viewMode === 'preview') {
      const doc = iframeRef.current.contentDocument
      if (doc) {
        doc.open()
        doc.write(html)
        doc.close()
      }
    }
  }, [html, viewMode])

  return (
    <div className={`rounded-lg border border-[var(--border)] overflow-hidden my-3 ${fullScreen ? 'fixed inset-4 z-50' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f8f9fa] border-b border-[var(--border)]">
        <span className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase">🌐 {title}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('preview')}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors ${viewMode === 'preview' ? 'bg-[var(--ink)] text-white' : 'bg-[var(--bg-hover)] text-[var(--ink-faint)]'}`}
          >
            Preview
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors ${viewMode === 'code' ? 'bg-[var(--ink)] text-white' : 'bg-[var(--bg-hover)] text-[var(--ink-faint)]'}`}
          >
            Code
          </button>
          <button
            onClick={() => setFullScreen(!fullScreen)}
            className="px-2 py-0.5 text-[10px] rounded bg-[var(--bg-hover)] text-[var(--ink-faint)] hover:bg-[var(--ink)] hover:text-white transition-colors"
          >
            {fullScreen ? '✕ Close' : '⤢ Expand'}
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'preview' ? (
        <iframe
          ref={iframeRef}
          className="w-full bg-white border-0"
          style={{ height: fullScreen ? 'calc(100vh - 40px)' : height }}
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <div className="max-h-[400px] overflow-auto bg-[#1e1e2e] p-3">
          <pre className="text-xs font-mono text-[#cdd6f4] whitespace-pre-wrap">{html}</pre>
        </div>
      )}
    </div>
  )
}
