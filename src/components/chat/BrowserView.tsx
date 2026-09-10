'use client'

import { useState, useCallback, useEffect } from 'react'

const PYTHON_BACKEND = process.env.NEXT_PUBLIC_PYTHON_BACKEND || 'http://localhost:8000'

interface BrowserViewProps {
  initialUrl?: string
}

export function BrowserView({ initialUrl = '' }: BrowserViewProps) {
  const [url, setUrl] = useState(initialUrl)
  const [inputUrl, setInputUrl] = useState(initialUrl)
  const [screenshot, setScreenshot] = useState('')
  const [pageTitle, setPageTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const navigate = useCallback(async (targetUrl: string) => {
    if (!targetUrl) return
    setLoading(true); setError('')
    try {
      const protocol = targetUrl.startsWith('http') ? '' : 'https://'
      const res = await fetch(`${PYTHON_BACKEND}/api/browser/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: protocol + targetUrl }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else {
        setScreenshot(data.screenshot || '')
        setPageTitle(data.title || '')
        setUrl(data.url || targetUrl)
        setInputUrl(data.url || targetUrl)
      }
    } catch (err) { setError(`Connection error: ${err}`) }
    finally { setLoading(false) }
  }, [])

  const exec = useCallback(async (action: string, params: any = {}) => {
    setLoading(true)
    try {
      const res = await fetch(`${PYTHON_BACKEND}/api/browser/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params }),
      })
      const data = await res.json()
      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.url) setUrl(data.url)
      return data
    } catch { setError('Action failed') }
    finally { setLoading(false) }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); navigate(inputUrl)
  }

  useEffect(() => { if (initialUrl) navigate(initialUrl) }, [initialUrl, navigate])

  return (
    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden my-3 bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f8f9fa] border-b border-[var(--color-border)]">
        <div className="flex gap-1">
          <button onClick={() => exec('back')} className="p-1 rounded hover:bg-gray-200 text-xs" title="Back">◀</button>
          <button onClick={() => navigate(url)} className="p-1 rounded hover:bg-gray-200 text-xs" title="Refresh">↻</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex">
          <input value={inputUrl} onChange={(e) => setInputUrl(e.target.value)}
            className="flex-1 px-2 py-1 text-xs font-mono bg-white border border-gray-200 rounded-l outline-none focus:border-blue-400"
            placeholder="Enter URL..." />
          <button type="submit" className="px-3 py-1 text-xs bg-gray-900 text-white rounded-r hover:bg-gray-800">Go</button>
        </form>
        <div className="flex gap-1">
          <button onClick={() => exec('screenshot')} className="p-1 rounded hover:bg-gray-200 text-xs" title="Screenshot">📸</button>
          <button onClick={() => exec('content')} className="p-1 rounded hover:bg-gray-200 text-xs" title="Extract text">📄</button>
        </div>
        {loading && <span className="text-[10px] text-gray-400">⏳</span>}
      </div>
      {pageTitle && <div className="px-3 py-1 border-b border-gray-100"><span className="text-[10px] text-gray-500">{pageTitle}</span></div>}
      <div className="relative bg-white" style={{ minHeight: 300 }}>
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10"><span className="text-sm text-gray-400">Loading...</span></div>}
        {error ? <div className="p-4 text-center text-sm text-red-500">{error}</div>
        : screenshot ? <img src={`data:image/png;base64,${screenshot}`} alt="Browser" className="w-full" />
        : <div className="flex items-center justify-center h-[300px] text-sm text-gray-400">Enter a URL to start browsing</div>}
      </div>
    </div>
  )
}
