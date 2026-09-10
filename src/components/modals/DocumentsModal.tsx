'use client'

import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'
import { useModalStore } from '@/store/modalStore'
import { useDocumentStore } from '@/store/documentStore'
import { useAgentStore } from '@/store/agentStore'
import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/db'

type DocTab = 'general' | string

export function DocumentsModal() {
  const activeModal = useModalStore((s) => s.activeModal)
  const closeModal = useModalStore((s) => s.closeModal)
  const { documents, loadDocuments, uploadFile, removeDocument } = useDocumentStore()
  const agents = useAgentStore((s) => s.agents)
  const [activeTab, setActiveTab] = useState<DocTab>('general')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (activeModal === 'documents') loadDocuments() }, [activeModal, loadDocuments])
  if (activeModal !== 'documents') return null

  const filtered = documents.filter((d) => activeTab === 'general' ? !d.agentId : d.agentId === activeTab)
  const generalCount = documents.filter((d) => !d.agentId).length

  const getIcon = (type: string) => {
    if (type.includes('pdf')) return { label: 'PDF', cls: 'bg-red-100 text-red-700' }
    if (type.includes('markdown') || type.includes('md')) return { label: 'MD', cls: 'bg-blue-100 text-blue-700' }
    if (type.includes('json')) return { label: 'JSON', cls: 'bg-yellow-100 text-yellow-700' }
    if (type.includes('csv') || type.includes('sheet')) return { label: 'CSV', cls: 'bg-green-100 text-green-700' }
    return { label: 'TXT', cls: 'bg-sand-200 text-sand-700' }
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    const agentId = activeTab === 'general' ? undefined : activeTab
    for (let i = 0; i < files.length; i++) await uploadFile(files[i], agentId)
  }

  return (
    <Modal open onClose={closeModal} title="Knowledge Base" description="Upload documents for RAG context." maxWidth="max-w-2xl">
      <div className="flex gap-1 mb-4 overflow-x-auto">
        <TabBtn active={activeTab === 'general'} onClick={() => setActiveTab('general')} count={generalCount}>General</TabBtn>
        {agents.map((agent) => {
          const count = documents.filter((d) => d.agentId === agent.id).length
          return (
            <TabBtn key={agent.id} active={activeTab === agent.id} onClick={() => setActiveTab(agent.id)} count={count} color={agent.avatarColor}>{agent.name}</TabBtn>
          )
        })}
      </div>

      <div
        className={cn('border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-4', dragOver ? 'border-sand-700 bg-surface-hover' : 'border-border hover:border-border-strong hover:bg-surface-hover')}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => { e.preventDefault(); setDragOver(false); await handleFiles(e.dataTransfer.files) }}
      >
        <input ref={fileRef} type="file" multiple accept=".pdf,.md,.txt,.json,.csv,.doc,.docx,.xlsx" onChange={(e) => handleFiles(e.target.files)} className="hidden" />
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mx-auto mb-1.5 text-ink-muted">
          <path d="M13 11v2.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5V11M9 2v7M6 4.5L9 1.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-xs text-ink-muted">Drop files here or click to browse</p>
        <p className="text-[10px] text-ink-muted mt-0.5">
          {activeTab === 'general' ? 'Upload to general knowledge base' : `Upload to ${agents.find((a) => a.id === activeTab)?.name}\'s knowledge base`}
        </p>
      </div>

      <div className="space-y-1 max-h-[35vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-ink-muted text-center py-6">No documents in this knowledge base</p>
        ) : filtered.map((doc) => {
          const icon = getIcon(doc.type)
          return (
            <div key={doc.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-hover group transition-colors">
              <div className={cn('w-7 h-7 rounded flex items-center justify-center text-[8px] font-bold shrink-0', icon.cls)}>{icon.label}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-ink truncate">{doc.name}</div>
                <div className="text-[10px] text-ink-muted">{formatFileSize(doc.size)}</div>
              </div>
              <button onClick={() => removeDocument(doc.id)} className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-ink-muted hover:text-red-600 transition-all">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex justify-end mt-4 pt-4 border-t border-border">
        <button onClick={closeModal} className="px-4 py-2 text-sm text-white bg-sand-800 hover:bg-ink rounded-lg transition-colors">Done</button>
      </div>
    </Modal>
  )
}

function TabBtn({ active, onClick, count, color, children }: { active: boolean; onClick: () => void; count: number; color?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn('flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md border whitespace-nowrap transition-colors shrink-0', active ? 'border-sand-700 bg-surface-hover text-ink' : 'border-border text-ink-muted hover:text-ink hover:border-border-strong')}>
      {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      {children}
      {count > 0 && <span className="text-[9px] text-ink-muted ml-0.5">{count}</span>}
    </button>
  )
}
