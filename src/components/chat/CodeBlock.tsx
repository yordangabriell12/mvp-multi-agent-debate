'use client'

import { useState, useRef, useCallback } from 'react'

interface CodeBlockProps {
  code: string
  language?: string
  showRun?: boolean
  onRun?: (code: string) => void
  isRunning?: boolean
}

export function CodeBlock({ code, language = 'python', showRun = true, onRun, isRunning }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  const isLong = code.split('\n').length > 20
  const displayCode = expanded || !isLong ? code : code.split('\n').slice(0, 20).join('\n') + '\n// ...'

  return (
    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden my-3 bg-[#1e1e2e]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#a6adc8] uppercase">{language}</span>
          <span className="text-[10px] text-[#585b70]">•</span>
          <span className="text-[10px] text-[#585b70]">{code.split('\n').length} lines</span>
        </div>
        <div className="flex items-center gap-1">
          {showRun && onRun && (
            <button
              onClick={() => onRun(code)}
              disabled={isRunning}
              className="px-2 py-0.5 text-[10px] rounded bg-[#a6e3a1] text-[#1e1e2e] font-semibold hover:bg-[#94e2d5] transition-colors disabled:opacity-50"
            >
              {isRunning ? '⏳ Running...' : '▶ Run'}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="px-2 py-0.5 text-[10px] rounded bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a] transition-colors"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
      {/* Code */}
      <pre ref={preRef} className="p-3 overflow-x-auto text-sm font-mono text-[#cdd6f4] leading-relaxed">
        <code>{displayCode}</code>
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-1.5 text-[11px] text-[#a6adc8] bg-[#181825] hover:bg-[#313244] transition-colors border-t border-[#313244]"
        >
          {expanded ? '↑ Show less' : `↓ Show all ${code.split('\n').length} lines`}
        </button>
      )}
    </div>
  )
}
