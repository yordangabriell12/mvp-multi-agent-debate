'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSessionStore } from '@/store/sessionStore'
import { useAgentStore } from '@/store/agentStore'
import { useDocumentStore } from '@/store/documentStore'
import { cn, getInitials } from '@/lib/utils'

const PYTHON_BACKEND = process.env.NEXT_PUBLIC_PYTHON_BACKEND || 'http://localhost:8000'

interface InputBarProps {
  sessionId: string
  onSend?: (message: string) => void
  loading?: boolean
  onStop?: () => void
}

export function InputBar({ sessionId, onSend, loading, onStop }: InputBarProps) {
  const session = useSessionStore((s) => s.sessions.find((sess) => sess.id === sessionId))
  const agents = useAgentStore((s) => s.agents)
  const uploadFile = useDocumentStore((s) => s.uploadFile)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionIdx, setMentionIdx] = useState(0)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number }[]>([])
  const [attachments, setAttachments] = useState<{ type: string; name: string; data: string }[]>([])
  const [mode, setMode] = useState<'chat' | 'code' | 'browser'>('chat')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const mRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const roomAgents = session ? agents.filter((a) => session.agentIds.includes(a.id)) : []
  const filtered = roomAgents.filter((a) => a.name.toLowerCase().includes(mentionFilter.toLowerCase()))
  // Include "@all" as an option in the mention popup
  const mentionOptions = [...(mentionFilter === '' || 'all'.startsWith(mentionFilter.toLowerCase()) ? [{ id: 'all', name: 'all', roleTitle: 'Everyone responds', avatarColor: '#44403c' }] : []), ...filtered]

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    t.style.height = 'auto'
    t.style.height = Math.min(t.scrollHeight, 120) + 'px'
    const v = t.value
    const lastAt = v.lastIndexOf('@')
    if (lastAt !== -1 && lastAt === v.length - 1) {
      setMentionOpen(true); setMentionFilter(''); setMentionIdx(0)
    } else if (lastAt !== -1 && !v.slice(lastAt).includes(' ')) {
      setMentionOpen(true); setMentionFilter(v.slice(lastAt + 1)); setMentionIdx(0)
    } else {
      setMentionOpen(false)
    }
  }, [])

  const insertMention = useCallback((name: string) => {
    const ta = taRef.current; if (!ta) return
    const v = ta.value; const lastAt = v.lastIndexOf('@')
    ta.value = v.slice(0, lastAt) + '@' + name + ' '
    ta.focus(); setMentionOpen(false)
    ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [])

  useEffect(() => {
    if (!mentionOpen) return
    const h = (e: MouseEvent) => { if (mRef.current && !mRef.current.contains(e.target as Node)) setMentionOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [mentionOpen])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const ta = taRef.current; if (!ta) return
    const text = ta.value.trim(); if (!text) return
    onSend?.(text)
    ta.value = ''; ta.style.height = 'auto'
  }

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      <form onSubmit={handleSubmit} className="max-w-[720px] mx-auto relative">
        {mentionOpen && mentionOptions.length > 0 && (
          <div ref={mRef} className="absolute bottom-full left-0 mb-1 w-56 bg-surface border border-border rounded-lg shadow-md py-1 z-50 animate-slide-in">
            {mentionOptions.map((agent, i) => (
              <button key={agent.id} type="button" onClick={() => insertMention(agent.name)} className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors', i === mentionIdx ? 'bg-surface-hover' : 'hover:bg-surface-hover')}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold text-white shrink-0" style={{ backgroundColor: agent.avatarColor }}>{getInitials(agent.name)}</div>
                <div className="flex-1 min-w-0"><div className="text-xs font-medium text-ink">{agent.name}</div><div className="text-[10px] text-ink-faint">{agent.roleTitle}</div></div>
              </button>
            ))}
          </div>
        )}
        <div className="border border-border-strong rounded-xl bg-surface focus-within:border-ink-faint transition-colors">
          {/* Mode toggle bar */}
          <div className="flex items-center gap-1 px-3 pt-2">
            <button type="button" onClick={() => setMode('chat')}
              className={cn('px-2 py-0.5 text-[10px] rounded-full transition-colors', mode === 'chat' ? 'bg-ink text-white' : 'text-ink-faint hover:bg-surface-hover')}>
              💬 Chat
            </button>
            <button type="button" onClick={() => setMode('code')}
              className={cn('px-2 py-0.5 text-[10px] rounded-full transition-colors', mode === 'code' ? 'bg-ink text-white' : 'text-ink-faint hover:bg-surface-hover')}>
              🐍 Code
            </button>
            <button type="button" onClick={() => setMode('browser')}
              className={cn('px-2 py-0.5 text-[10px] rounded-full transition-colors', mode === 'browser' ? 'bg-ink text-white' : 'text-ink-faint hover:bg-surface-hover')}>
              🌐 Browse
            </button>
            <div className="flex-1" />
            <button type="button" onClick={async () => {
              const url = prompt('Enter URL to attach:')
              if (url) setAttachments(prev => [...prev, { type: 'webpage', name: url, data: url }])
            }} className="p-1 text-[10px] text-ink-faint hover:text-ink rounded hover:bg-surface-hover" title="Attach web page">
              🔗
            </button>
            <button type="button" onClick={async () => {
              const text = prompt('Enter knowledge to add:')
              if (text) setAttachments(prev => [...prev, { type: 'knowledge', name: 'Note', data: text }])
            }} className="p-1 text-[10px] text-ink-faint hover:text-ink rounded hover:bg-surface-hover" title="Attach knowledge">
              📚
            </button>
          </div>
          <div className="flex items-end gap-2">
            <textarea ref={taRef} placeholder={mode === 'code' ? 'Write Python code... (⌘+Enter to run)' : mode === 'browser' ? 'Enter URL to browse...' : 'Ask the room… (@Maya, @all, or leave blank for auto)'} rows={1} disabled={loading}
              className="flex-1 resize-none bg-transparent px-3 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none min-h-[44px] max-h-[120px] disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) { e.preventDefault(); e.currentTarget.form?.requestSubmit() }
                if (mentionOpen && mentionOptions.length > 0) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((p) => Math.min(p + 1, mentionOptions.length - 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((p) => Math.max(p - 1, 0)) }
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionOptions[mentionIdx].name) }
                  if (e.key === 'Escape') setMentionOpen(false)
                }
              }}
              onInput={handleInput}
            />
            <div className="flex items-center gap-1 pr-2 pb-2.5">
              <button type="button" onClick={() => setShowUpload(!showUpload)} className={cn('w-8 h-8 flex items-center justify-center rounded-lg transition-colors', showUpload ? 'text-ink bg-surface-hover' : 'text-ink-faint hover:text-ink-muted hover:bg-surface-hover')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14 10v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2M8 2v8M5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {loading ? (
                <button type="button" onClick={onStop} className="w-8 h-8 rounded-lg bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" /></svg>
                </button>
              ) : (
                <button type="submit" className="w-8 h-8 rounded-lg bg-sand-800 text-white flex items-center justify-center hover:bg-ink transition-colors">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M12.5 1.5L6 8M12.5 1.5l-4 11-2-5-5-2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
            </div>
          </div>
          {showUpload && (
            <div className="mx-3 mb-3 border-2 border-dashed border-border-strong rounded-lg p-4 text-center cursor-pointer hover:border-ink-faint transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault()
                const files = e.dataTransfer.files
                for (let i = 0; i < files.length; i++) {
                  const doc = await uploadFile(files[i])
                  if (doc) setUploadedFiles((p) => [...p, { name: doc.name, size: doc.size }])
                }
              }}
            >
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.md,.txt,.json,.csv,.doc,.docx,.xlsx" onChange={async (e) => {
                const files = e.target.files; if (!files) return
                for (let i = 0; i < files.length; i++) {
                  const doc = await uploadFile(files[i])
                  if (doc) setUploadedFiles((p) => [...p, { name: doc.name, size: doc.size }])
                }
              }} className="hidden" />
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mx-auto mb-1.5 text-ink-faint"><path d="M13 11v2.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5V11M9 2v7M6 4.5L9 1.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <p className="text-xs text-ink-muted">Drop files here or click to browse</p>
              <p className="text-[10px] text-ink-faint mt-0.5">PDF, MD, TXT, JSON, CSV</p>
              {uploadedFiles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 justify-center">
                  {uploadedFiles.map((f, i) => (<span key={i} className="text-[10px] bg-surface-inset px-2 py-0.5 rounded-full text-ink-muted">{f.name}</span>))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 px-1">
          <span className="text-[11px] text-ink-faint">
            <code className="px-1 py-0.5 bg-surface-inset rounded text-ink-muted font-mono text-[10px]">@Name</code> tag an agent
            <span className="mx-1">·</span>
            <code className="px-1 py-0.5 bg-surface-inset rounded text-ink-muted font-mono text-[10px]">@all</code> all respond
            <span className="mx-1">·</span>
            no tag = auto
          </span>
        </div>
      </form>
    </div>
  )
}
