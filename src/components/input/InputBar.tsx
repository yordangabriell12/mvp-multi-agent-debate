'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSessionStore } from '@/store/sessionStore'
import { useAgentStore } from '@/store/agentStore'
import { useDocumentStore } from '@/store/documentStore'
import { cn, getInitials } from '@/lib/utils'
import type { MessageAttachment } from '@/types/message'
import { ImproveButton } from '@/components/common/ImproveButton'

interface InputBarProps {
  sessionId: string
  onSend?: (message: string, attachments?: MessageAttachment[]) => void
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
  const [uploadedFiles, setUploadedFiles] = useState<MessageAttachment[]>([])
  const [uploadError, setUploadError] = useState('')
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

  /**
   * Uploads a set of files and records what each one becomes.
   *
   * One function for the file picker and the drop zone, because the two copies had
   * already drifted: both had to be changed in step, and the metadata that makes the
   * attachment visible in the conversation had to be added twice.
   */
  const handleFiles = async (files: FileList) => {
    setUploadError('')
    for (let i = 0; i < files.length; i++) {
      const doc = await uploadFile(files[i])
      if (!doc) {
        setUploadError(useDocumentStore.getState().lastError || 'That file could not be read.')
        continue
      }
      setUploadedFiles((previous) => [
        ...previous,
        {
          name: doc.name,
          type: doc.type,
          size: doc.size,
          thumbnail: doc.thumbnail,
          width: doc.width,
          height: doc.height,
          method: doc.method,
          viaOcr: doc.viaOcr,
          warning: doc.warning,
          textLength: doc.content.length,
        },
      ])

      // A file that was kept but could not be read still needs saying, and it does not
      // travel through the error path any more, so it is surfaced here. Otherwise the
      // reader attaches a scan, sees a chip appear, and only discovers inside the
      // conversation that its contents were never available to the agents.
      if (doc.warning) setUploadError(doc.warning)
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const ta = taRef.current; if (!ta) return
    const text = ta.value.trim()
    // A file with no question is allowed: "here is the document" is a complete
    // request, and the agents read the attachment before answering.
    if (!text && uploadedFiles.length === 0) return
    onSend?.(text, uploadedFiles.length > 0 ? uploadedFiles : undefined)
    ta.value = ''; ta.style.height = 'auto'
    // Cleared here, because the attachments now belong to the message that was just
    // sent. Keeping them would silently attach the same document to the next question.
    setUploadedFiles([])
  }

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      <form onSubmit={handleSubmit} className="max-w-[720px] mx-auto relative">
        {mentionOpen && mentionOptions.length > 0 && (
          <div ref={mRef} className="absolute bottom-full left-0 mb-1 w-56 bg-surface border border-border rounded-lg shadow-md py-1 z-50 animate-slide-in">
            {mentionOptions.map((agent, i) => (
              <button key={agent.id} type="button" onClick={() => insertMention(agent.name)} className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors', i === mentionIdx ? 'bg-surface-hover' : 'hover:bg-surface-hover')}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold text-white shrink-0" style={{ backgroundColor: agent.avatarColor }}>{getInitials(agent.name)}</div>
                <div className="flex-1 min-w-0"><div className="text-xs font-medium text-ink">{agent.name}</div><div className="text-[10px] text-ink-muted">{agent.roleTitle}</div></div>
              </button>
            ))}
          </div>
        )}
        <div className="border border-border-strong rounded-xl bg-surface focus-within:border-ink-faint transition-colors">
          <div className="flex items-end gap-2">
            <textarea ref={taRef} placeholder="Ask the room… (@Maya, @all, or leave blank for auto)" rows={1} disabled={loading}
              className="flex-1 resize-none bg-transparent px-3 py-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none min-h-[44px] max-h-[120px] disabled:opacity-50"
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
              <button type="button" onClick={() => setShowUpload(!showUpload)} aria-label={showUpload ? 'Close the file upload panel' : 'Attach files'} title={showUpload ? 'Close the file upload panel' : 'Attach files'} className={cn('w-8 h-8 flex items-center justify-center rounded-lg transition-colors', showUpload ? 'text-ink bg-surface-hover' : 'text-ink-muted hover:text-ink-muted hover:bg-surface-hover')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14 10v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2M8 2v8M5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {loading ? (
                <button type="button" onClick={onStop} aria-label="Stop" title="Stop" className="w-8 h-8 rounded-lg bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" /></svg>
                </button>
              ) : (
                <button type="submit" aria-label="Send" title="Send" className="w-8 h-8 rounded-lg bg-sand-800 text-white flex items-center justify-center hover:bg-ink transition-colors">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M12.5 1.5L6 8M12.5 1.5l-4 11-2-5-5-2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
            </div>
          </div>
          {showUpload && (
            /* The drop zone is the control a person actually presses, and it holds
               the hidden file input. It carries role/tabIndex and a key handler
               because a div with only onClick is reachable by mouse and by nothing
               else: someone using a keyboard could open the panel and then have no
               way to choose a file. The aria-label is also what names it for a
               screen reader, since the visible text lives in child paragraphs. */
            <div className="mx-3 mb-3 border-2 border-dashed border-border-strong rounded-lg p-4 text-center cursor-pointer hover:border-ink-faint transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-faint"
              role="button"
              tabIndex={0}
              aria-label="Drop files here, or choose files to upload"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  // Space would otherwise scroll the conversation.
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault()
                await handleFiles(e.dataTransfer.files)
              }}
            >
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.md,.markdown,.txt,.json,.csv,.tsv,.log,.yaml,.yml,.xml,.html,.htm,.sql,.png,.jpg,.jpeg,.gif,.webp" onChange={async (e) => {
                const files = e.target.files; if (!files) return
                await handleFiles(files)
                // Reset so choosing the same file again still fires a change event.
                e.target.value = ''
              }} className="hidden" aria-label="Choose files to upload" />
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mx-auto mb-1.5 text-ink-muted" aria-hidden="true"><path d="M13 11v2.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5V11M9 2v7M6 4.5L9 1.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <p className="text-xs text-ink-muted">Drop files here or click to browse</p>
              <p className="text-[10px] text-ink-muted mt-0.5">PDF, images, MD, TXT, JSON, CSV</p>
              {uploadedFiles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
                  {uploadedFiles.map((f, i) => (
                    <span
                      key={i}
                      title={f.name}
                      className="flex items-center gap-1.5 max-w-[180px] pl-1 pr-2 py-0.5 text-[10px] bg-surface-inset rounded-full text-ink-muted"
                    >
                      {/* A thumbnail where there is one, so the reader recognises the
                          file rather than reading a filename off a chip. */}
                      {f.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data URL
                        <img src={f.thumbnail} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
                      ) : (
                        <span className="w-4 h-4 rounded-full bg-sand-300 shrink-0" aria-hidden="true" />
                      )}
                      <span className="truncate">{f.name}</span>
                    </span>
                  ))}
                </div>
              )}
              {/* The failure is shown here rather than silently dropping the file.
                  A PDF with no vision model configured is the common case, and it
                  needs an explanation, not an unchanged screen. */}
              {uploadError && (
                <p role="alert" className="mt-2 text-[10px] text-red-700">{uploadError}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-2 px-1">
          <span className="text-[11px] text-ink-muted">
            <code className="px-1 py-0.5 bg-surface-inset rounded text-ink-muted font-mono text-[10px]">@Name</code> tag an agent
            <span className="mx-1">·</span>
            <code className="px-1 py-0.5 bg-surface-inset rounded text-ink-muted font-mono text-[10px]">@all</code> all respond
            <span className="mx-1">·</span>
            no tag = auto
          </span>
          <ImproveButton
            className="ml-auto"
            mode="chat"
            label="Improve message"
            getText={() => taRef.current?.value || ''}
            onImproved={(text) => {
              const ta = taRef.current
              if (!ta) return
              ta.value = text
              ta.style.height = 'auto'
              ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
              ta.focus()
            }}
          />
        </div>
      </form>
    </div>
  )
}
