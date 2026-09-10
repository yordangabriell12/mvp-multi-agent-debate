'use client'

import { useState, useEffect, useCallback } from 'react'

const PYTHON_BACKEND = process.env.NEXT_PUBLIC_PYTHON_BACKEND || 'http://localhost:8000'

interface ScheduledTask {
  id: string
  trigger: string
  next_run: string | null
}

export function TaskScheduler() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [showForm, setShowForm] = useState(false)
  const [taskId, setTaskId] = useState('')
  const [taskType, setTaskType] = useState<'code' | 'browser'>('code')
  const [interval, setInterval_] = useState(60)
  const [code, setCode] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch(`${PYTHON_BACKEND}/api/schedule/list`)
      const data = await res.json()
      setTasks(data.jobs || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])

  const createTask = async () => {
    if (!taskId.trim()) return
    setSaving(true)
    try {
      const config = taskType === 'code' ? { code } : { url, action: 'content' }
      const res = await fetch(`${PYTHON_BACKEND}/api/schedule/interval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, minutes: interval, task_type: taskType, config }),
      })
      const data = await res.json()
      if (data.ok) {
        setShowForm(false)
        setTaskId('')
        setCode('')
        setUrl('')
        loadTasks()
      }
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const removeTask = async (id: string) => {
    await fetch(`${PYTHON_BACKEND}/api/schedule/${id}`, { method: 'DELETE' })
    loadTasks()
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden my-3">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="text-[10px] font-semibold text-gray-500 uppercase">⏰ Task Scheduler</span>
        <button onClick={() => setShowForm(!showForm)} className="text-[10px] text-gray-500 hover:text-gray-900">
          {showForm ? '✕ Cancel' : '+ New Task'}
        </button>
      </div>

      {showForm && (
        <div className="p-3 bg-white space-y-2 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-2">
            <input value={taskId} onChange={e => setTaskId(e.target.value)} placeholder="Task ID (e.g., daily-scrape)"
              className="px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-blue-400" />
            <select value={taskType} onChange={e => setTaskType(e.target.value as any)}
              className="px-2 py-1 text-xs border border-gray-200 rounded bg-white outline-none">
              <option value="code">Python Code</option>
              <option value="browser">Browser Scrape</option>
            </select>
          </div>
          {taskType === 'code' ? (
            <textarea value={code} onChange={e => setCode(e.target.value)} placeholder="Python code to run periodically..."
              rows={3} className="w-full px-2 py-1 text-xs font-mono border border-gray-200 rounded outline-none focus:border-blue-400 resize-none" />
          ) : (
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="URL to scrape"
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-blue-400" />
          )}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-500">Every</label>
            <input type="number" value={interval} onChange={e => setInterval_(Number(e.target.value))} min={1}
              className="w-16 px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-blue-400" />
            <label className="text-[10px] text-gray-500">minutes</label>
            <div className="flex-1" />
            <button onClick={createTask} disabled={saving || !taskId.trim()}
              className="px-3 py-1 text-[10px] rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40">
              {saving ? '...' : '✓ Create'}
            </button>
          </div>
        </div>
      )}

      {tasks.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {tasks.map(t => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-2 bg-white">
              <span className="text-xs">⏰</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-900">{t.id}</div>
                <div className="text-[10px] text-gray-500">{t.trigger} {t.next_run ? `• Next: ${t.next_run}` : ''}</div>
              </div>
              <button onClick={() => removeTask(t.id)} className="text-[10px] text-red-400 hover:text-red-600">✕</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center text-xs text-gray-400">
          No scheduled tasks. Click "+ New Task" to create one.
        </div>
      )}
    </div>
  )
}
