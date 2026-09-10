'use client'

import { useState } from 'react'

const PYTHON_BACKEND = process.env.NEXT_PUBLIC_PYTHON_BACKEND || 'http://localhost:8000'

interface SubAgent {
  name: string
  role: string
  status: 'idle' | 'running' | 'done' | 'error'
  result?: string
}

interface SubAgentSpawnerProps {
  onResult?: (result: string) => void
}

export function SubAgentSpawner({ onResult }: SubAgentSpawnerProps) {
  const [agents, setAgents] = useState<SubAgent[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [task, setTask] = useState('')
  const [model, setModel] = useState('gpt-4o')
  const [spawning, setSpawning] = useState(false)

  const spawnAgent = async () => {
    if (!task.trim()) return
    const agentName = name || `Agent-${agents.length + 1}`
    const agentRole = role || 'General Assistant'

    setAgents(prev => [...prev, { name: agentName, role: agentRole, status: 'running' }])
    setSpawning(true)

    try {
      const res = await fetch(`${PYTHON_BACKEND}/api/crew/sub-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: agentName, role: agentRole, task, model }),
      })
      const data = await res.json()
      setAgents(prev => prev.map(a =>
        a.name === agentName ? { ...a, status: data.ok ? 'done' : 'error', result: data.result || data.error } : a
      ))
      if (data.ok && data.result) onResult?.(data.result)
    } catch (err) {
      setAgents(prev => prev.map(a => a.name === agentName ? { ...a, status: 'error', result: String(err) } : a))
    } finally {
      setSpawning(false)
      setName('')
      setRole('')
      setTask('')
    }
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden my-3">
      <div className="px-3 py-1.5 bg-[#f8f9fa] border-b border-[var(--color-border)]">
        <span className="text-[10px] font-semibold text-gray-500 uppercase">🤖 Sub-Agent Spawner</span>
      </div>

      {/* Agent form */}
      <div className="p-3 bg-white space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Agent name"
            className="px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-blue-400" />
          <input value={role} onChange={e => setRole(e.target.value)} placeholder="Role (e.g., Researcher)"
            className="px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-blue-400" />
        </div>
        <textarea value={task} onChange={e => setTask(e.target.value)} placeholder="Task description — what should the agent do?"
          rows={2} className="w-full px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-blue-400 resize-none" />
        <div className="flex items-center gap-2">
          <select value={model} onChange={e => setModel(e.target.value)}
            className="px-2 py-1 text-[10px] border border-gray-200 rounded bg-white outline-none">
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
            <option value="claude-sonnet-4-20250514">Claude Sonnet</option>
          </select>
          <div className="flex-1" />
          <button onClick={spawnAgent} disabled={spawning || !task.trim()}
            className="px-3 py-1 text-[10px] rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40 transition-colors">
            {spawning ? '⏳ Spawning...' : '🚀 Spawn Agent'}
          </button>
        </div>
      </div>

      {/* Active agents */}
      {agents.length > 0 && (
        <div className="border-t border-gray-100 divide-y divide-gray-100 max-h-[200px] overflow-auto">
          {agents.map((a, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2">
              <span className="text-sm">
                {a.status === 'running' ? '⏳' : a.status === 'done' ? '✅' : a.status === 'error' ? '❌' : '💤'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-900">{a.name} <span className="font-normal text-gray-500">— {a.role}</span></div>
                {a.result && (
                  <div className="text-[11px] text-gray-600 mt-1 whitespace-pre-wrap line-clamp-4">{a.result}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
