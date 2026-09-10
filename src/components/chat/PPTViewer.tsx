'use client'

import { useState } from 'react'

const PYTHON_BACKEND = process.env.NEXT_PUBLIC_PYTHON_BACKEND || 'http://localhost:8000'

interface PPTViewerProps {
  pptUrl?: string
  filename?: string
}

export function PPTViewer({ pptUrl, filename }: PPTViewerProps) {
  const [generating, setGenerating] = useState(false)
  const [slides, setSlides] = useState<{ title: string; content: string }[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)

  return (
    <div className="rounded-lg border border-[var(--border)] overflow-hidden my-3 bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f8f9fa] border-b border-[var(--border)]">
        <span className="text-[10px] font-semibold text-gray-500 uppercase">📊 Presentation</span>
        <div className="flex items-center gap-2">
          {slides.length > 0 && (
            <span className="text-[10px] text-gray-400">{currentSlide + 1} / {slides.length}</span>
          )}
          {filename && (
            <a href={`${PYTHON_BACKEND}/api/ppt/download/${filename}`} target="_blank" rel="noopener"
              className="px-2 py-0.5 text-[10px] rounded bg-gray-900 text-white hover:bg-gray-800">
              ⬇ Download
            </a>
          )}
        </div>
      </div>

      {slides.length > 0 ? (
        <div>
          {/* Slide content */}
          <div className="p-8 min-h-[250px] flex flex-col justify-center">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{slides[currentSlide]?.title}</h2>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {slides[currentSlide]?.content}
            </div>
          </div>
          {/* Navigation */}
          <div className="flex items-center justify-center gap-2 py-2 border-t border-gray-100">
            <button onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
              disabled={currentSlide === 0}
              className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30">
              ← Prev
            </button>
            {slides.map((_, i) => (
              <button key={i} onClick={() => setCurrentSlide(i)}
                className={`w-2 h-2 rounded-full transition-colors ${i === currentSlide ? 'bg-gray-900' : 'bg-gray-300'}`} />
            ))}
            <button onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
              disabled={currentSlide === slides.length - 1}
              className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30">
              Next →
            </button>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-sm text-gray-400">
          {generating ? '⏳ Generating presentation...' : 'No presentation loaded'}
        </div>
      )}
    </div>
  )
}
