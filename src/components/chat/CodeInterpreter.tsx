'use client'

import { useState, useRef, useEffect } from 'react'

const PYTHON_BACKEND = process.env.NEXT_PUBLIC_PYTHON_BACKEND || 'http://localhost:8000'

interface CodeOutput {
  stdout: string
  stderr: string
  success: boolean
  exit_code?: number
  output_images: string[]
}

interface CodeInterpreterProps {
  initialCode?: string
  onResult?: (result: CodeOutput) => void
}

export function CodeInterpreter({ initialCode = '', onResult }: CodeInterpreterProps) {
  const [code, setCode] = useState(initialCode)
  const [output, setOutput] = useState<CodeOutput | null>(null)
  const [running, setRunning] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 300) + 'px'
    }
  }, [code])

  const executeCode = async () => {
    if (!code.trim() || running) return
    setRunning(true)
    setOutput(null)

    try {
      const res = await fetch(`${PYTHON_BACKEND}/api/code/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, capture_images: true }),
      })
      const result: CodeOutput = await res.json()
      setOutput(result)
      onResult?.(result)
    } catch (err) {
      setOutput({ stdout: '', stderr: `Connection error: ${err}`, success: false, output_images: [] })
    } finally {
      setRunning(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      executeCode()
    }
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden my-3 bg-[#1e1e2e]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <span className="text-[10px] font-mono text-[#a6adc8] uppercase">🐍 Python Interpreter</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#585b70]">⌘+Enter to run</span>
          <button
            onClick={executeCode}
            disabled={running || !code.trim()}
            className="px-3 py-0.5 text-[10px] rounded bg-[#a6e3a1] text-[#1e1e2e] font-semibold hover:bg-[#94e2d5] transition-colors disabled:opacity-40"
          >
            {running ? '⏳ Running...' : '▶ Run'}
          </button>
        </div>
      </div>

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="# Write Python code here...\nprint('Hello from VMA!')"
        spellCheck={false}
        className="w-full min-h-[80px] max-h-[300px] p-3 bg-transparent text-[#cdd6f4] font-mono text-sm leading-relaxed resize-none outline-none placeholder-[#585b70]"
      />

      {/* Output */}
      {output && (
        <div className="border-t border-[#313244]">
          <div className="px-3 py-1 bg-[#181825] flex items-center gap-2">
            <span className={`text-[10px] font-semibold ${output.success ? 'text-[#a6e3a1]' : 'text-[#f38ba8]'}`}>
              {output.success ? '✅ Success' : `❌ Error (exit ${output.exit_code})`}
            </span>
          </div>
          <div className="p-3 bg-[#11111b] max-h-[300px] overflow-auto">
            {output.stdout && (
              <pre className="text-sm font-mono text-[#a6e3a1] whitespace-pre-wrap">{output.stdout}</pre>
            )}
            {output.stderr && (
              <pre className="text-sm font-mono text-[#f38ba8] whitespace-pre-wrap mt-1">{output.stderr}</pre>
            )}
            {output.output_images?.map((img, i) => (
              <img key={i} src={`data:image/png;base64,${img}`} alt={`Output ${i + 1}`} className="mt-2 max-w-full rounded" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
