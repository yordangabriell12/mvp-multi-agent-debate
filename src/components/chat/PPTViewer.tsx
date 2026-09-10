'use client'

import { useState } from 'react'

const PYTHON_BACKEND = process.env.NEXT_PUBLIC_PYTHON_BACKEND || 'http://localhost:8000'

interface PPTViewerProps {
  /** Slides carried on the message itself, when a producer supplied them. */
  slides?: { title: string; content: string }[]
  /** File name on the optional backend, used for the download link. */
  filename?: string
}

export function PPTViewer({ slides: slidesProp, filename }: PPTViewerProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const slides = slidesProp ?? []

  return (
    <div className="rounded-lg border border-border overflow-hidden my-3 bg-surface">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-inset border-b border-border">
        <span className="text-[10px] font-semibold text-ink-muted uppercase">Presentation</span>
        <div className="flex items-center gap-2">
          {slides.length > 0 && (
            <span className="text-[10px] text-ink-muted">{currentSlide + 1} / {slides.length}</span>
          )}
          {filename && (
            <a
              href={`${PYTHON_BACKEND}/api/ppt/download/${encodeURIComponent(filename)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-0.5 text-[10px] rounded bg-sand-800 text-white hover:bg-ink transition-colors"
            >
              Download
            </a>
          )}
        </div>
      </div>

      {slides.length > 0 ? (
        <div>
          {/* Slide content */}
          <div className="p-8 min-h-[250px] flex flex-col justify-center">
            <h2 className="text-xl font-semibold text-ink mb-4">{slides[currentSlide]?.title}</h2>
            <div className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
              {slides[currentSlide]?.content}
            </div>
          </div>
          {/* Navigation */}
          <div className="flex items-center justify-center gap-2 py-2 border-t border-border">
            <button
              onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
              disabled={currentSlide === 0}
              className="px-3 py-1 text-xs text-ink-muted border border-border rounded hover:text-ink hover:bg-surface-hover disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 transition-colors"
            >
              Prev
            </button>
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`w-2 h-2 rounded-full transition-colors ${i === currentSlide ? 'bg-ink' : 'bg-sand-400'}`}
              />
            ))}
            <button
              onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
              disabled={currentSlide === slides.length - 1}
              className="px-3 py-1 text-xs text-ink-muted border border-border rounded hover:text-ink hover:bg-surface-hover disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-sm text-ink-muted">
          {filename
            ? 'No slides were attached to this message. Use the download link to open the file.'
            : 'No presentation in this message.'}
        </div>
      )}
    </div>
  )
}
