'use client'

import { useState, useEffect, useCallback } from 'react'

const PYTHON_BACKEND = process.env.NEXT_PUBLIC_PYTHON_BACKEND || 'http://localhost:8000'

interface KnowledgeDoc {
  id: string
  document: string
  metadata: Record<string, any>
}

interface KnowledgePanelProps {
  onQuery?: (query: string, results: any[]) => void
}

export function KnowledgePanel({ onQuery }: KnowledgePanelProps) {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [query, setQuery] = useState('')
  const [addText, setAddText] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [tab, setTab] = useState<'docs' | 'add' | 'search'>('docs')
  const [loading, setLoading] = useState(false)

  const loadDocs = useCallback(async () => {
    try { const res = await fetch(`${PYTHON_BACKEND}/api/knowledge/list`); const data = await res.json(); setDocs(data.documents || []) }
    catch { /* ignore */ }
  }, [])

  useEffect(() => { loadDocs() }, [loadDocs])

  const addDoc = async () => {
    if (!addText.trim()) return
    setLoading(true)
    try {
      await fetch(`${PYTHON_BACKEND}/api/knowledge/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: addText, metadata: { source: 'manual' } }),
      })
      setAddText(''); loadDocs(); setTab('docs')
    } catch {} finally { setLoading(false) }
  }

  const addWeb = async () => {
    if (!addUrl.trim()) return
    setLoading(true)
    try {
      await fetch(`${PYTHON_BACKEND}/api/knowledge/add-web`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: addUrl, text: '', metadata: {} }),
      })
      setAddUrl(''); loadDocs(); setTab('docs')
    } catch {} finally { setLoading(false) }
  }

  const searchKnowledge = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`${PYTHON_BACKEND}/api/knowledge/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, n_results: 5 }),
      })
      const data = await res.json()
      setSearchResults(data.results || [])
      onQuery?.(query, data.results || [])
    } catch {} finally { setLoading(false) }
  }

  const deleteDoc = async (id: string) => {
    await fetch(`${PYTHON_BACKEND}/api/knowledge/${id}`, { method: 'DELETE' })
    loadDocs()
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden my-3">
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="text-[10px] font-semibold text-gray-500 uppercase">📚 Knowledge Base ({docs.length})</span>
      </div>
      <div className="flex border-b border-gray-100">
        {(['docs', 'add', 'search'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-colors ${tab === t ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
            {t === 'docs' ? `📄 Docs (${docs.length})` : t === 'add' ? '➕ Add' : '🔍 Search'}
          </button>
        ))}
      </div>
      <div className="bg-white">
        {tab === 'docs' && (
          <div className="max-h-[200px] overflow-auto divide-y divide-gray-100">
            {docs.length === 0
              ? <div className="p-4 text-center text-xs text-gray-400">No documents yet</div>
              : docs.map(d => (
                <div key={d.id} className="flex items-start gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-900 line-clamp-2">{d.document}</div>
                    <div className="text-[10px] text-gray-400">{d.metadata?.source || 'unknown'}</div>
                  </div>
                  <button onClick={() => deleteDoc(d.id)} className="text-[10px] text-red-400 hover:text-red-600">✕</button>
                </div>
              ))
            }
          </div>
        )}
        {tab === 'add' && (
          <div className="p-3 space-y-2">
            <textarea value={addText} onChange={e => setAddText(e.target.value)} placeholder="Paste knowledge text..."
              rows={3} className="w-full px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-blue-400 resize-none" />
            <button onClick={addDoc} disabled={loading || !addText.trim()}
              className="w-full px-3 py-1 text-[10px] rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40">Add Text</button>
            <div className="flex gap-2">
              <input value={addUrl} onChange={e => setAddUrl(e.target.value)} placeholder="Or add from URL..."
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded outline-none" />
              <button onClick={addWeb} disabled={loading || !addUrl.trim()}
                className="px-3 py-1 text-[10px] rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40">Add URL</button>
            </div>
          </div>
        )}
        {tab === 'search' && (
          <div className="p-3 space-y-2">
            <div className="flex gap-2">
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search knowledge..."
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded outline-none"
                onKeyDown={e => e.key === 'Enter' && searchKnowledge()} />
              <button onClick={searchKnowledge} disabled={loading || !query.trim()}
                className="px-3 py-1 text-[10px] rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40">Search</button>
            </div>
            {searchResults.map((r, i) => (
              <div key={i} className="p-2 bg-gray-50 rounded text-xs">
                <div className="text-gray-900">{r.document}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">Distance: {r.distance?.toFixed(3)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
