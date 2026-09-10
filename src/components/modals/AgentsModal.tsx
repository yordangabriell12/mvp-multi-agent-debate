'use client'

import { useState } from 'react'
import { Modal } from './Modal'
import { useModalStore } from '@/store/modalStore'
import { useAgentStore } from '@/store/agentStore'
import { useSettingsStore } from '@/store/settingsStore'
import { AGENT_COLORS, type AgentTone } from '@/types/agent'
import { cn, getInitials } from '@/lib/utils'

export function AgentsModal() {
  const activeModal = useModalStore((s) => s.activeModal)
  const closeModal = useModalStore((s) => s.closeModal)
  const { agents, addAgent, updateAgent, removeAgent } = useAgentStore()
  const providers = useSettingsStore((s) => s.providers)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', role: '', tone: 'debate' as AgentTone, color: AGENT_COLORS[0], prompt: '', temperature: '' })

  const reset = () => { setEditId(null); setForm({ name: '', role: '', tone: 'debate', color: AGENT_COLORS[0], prompt: '', temperature: '' }) }
  const handleEdit = (a: typeof agents[0]) => { setEditId(a.id); setForm({ name: a.name, role: a.roleTitle, tone: a.tone, color: a.avatarColor, prompt: a.systemPrompt, temperature: a.model.temperature === undefined ? '' : String(a.model.temperature) }) }
  const handleSave = () => {
    if (!form.name.trim()) return
    // Auto-pick first available provider + model
    const firstProvider = providers.find((p) => p.apiKey) || providers[0]
    const firstModel = firstProvider?.models[0]
    const parsedTemperature = Number.parseFloat(form.temperature)
    const temperature = Number.isFinite(parsedTemperature)
      ? Math.min(2, Math.max(0, parsedTemperature))
      : undefined
    const data = {
      name: form.name,
      roleTitle: form.role,
      tone: form.tone,
      avatarColor: form.color,
      systemPrompt: form.prompt,
      model: {
        provider: firstProvider?.id || 'openai',
        modelName: firstModel?.id || '',
        ...(temperature === undefined ? {} : { temperature }),
      },
      persona: { personality: '', communicationStyle: '', values: [], biases: '', agreeableness: 0.5, confidence: 0.7, depth: 0.7, steelmansOthers: true, admitsUncertainty: true, usesRealExamples: true, challengesAssumptions: false },
      skills: [],
      webSearch: false,
      memory: [],
    }
    if (editId) updateAgent(editId, data); else addAgent(data)
    reset()
  }

  if (activeModal !== 'agents') return null
  return (
    <Modal open onClose={() => { reset(); closeModal() }} title="Manage Agents" description="Create and configure your AI agents." maxWidth="max-w-xl">
      <div className="space-y-3 max-h-40 overflow-y-auto">
        {agents.map((a) => (
          <div key={a.id} className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg', editId === a.id ? 'bg-surface-hover' : 'hover:bg-surface-hover')}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0" style={{ backgroundColor: a.avatarColor }}>{getInitials(a.name)}</div>
            <div className="flex-1 min-w-0"><div className="text-xs font-medium text-ink">{a.name}</div><div className="text-[11px] text-ink-muted">{a.roleTitle}</div></div>
            <button onClick={() => handleEdit(a)} className="text-[11px] text-ink-muted hover:text-ink px-2 py-1 rounded transition-colors">Edit</button>
            <button onClick={() => removeAgent(a.id)} className="text-[11px] text-ink-muted hover:text-red-600 px-2 py-1 rounded transition-colors">Del</button>
          </div>
        ))}
      </div>
      <div className="border-t border-border pt-4 mt-3 space-y-3">
        <div className="text-xs font-medium text-ink-muted">{editId ? 'Edit Agent' : 'New Agent'}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[11px] text-ink-muted block mb-1">Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint" /></div>
          <div><label className="text-[11px] text-ink-muted block mb-1">Role</label><input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint" /></div>
        </div>
        <div><label className="text-[11px] text-ink-muted block mb-1">Tone</label>
          <div className="flex gap-1">{(['debate', 'supportive', 'expert'] as const).map((t) => (<button key={t} onClick={() => setForm({ ...form, tone: t })} className={cn('px-3 py-1.5 text-xs rounded-md border capitalize', form.tone === t ? 'border-sand-700 bg-surface-hover text-ink' : 'border-border text-ink-muted')}>{t}</button>))}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-ink-muted block mb-1">Temperature</label>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: e.target.value })}
              placeholder="default"
              className="w-full px-3 py-2 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint"
            />
            <p className="text-[10px] text-ink-muted mt-1">Blank uses the provider default. Ignored by reasoning models.</p>
          </div>
          <div>
            <label className="text-[11px] text-ink-muted block mb-1">Color</label>
            <div className="flex gap-2 pt-2">{AGENT_COLORS.map((c) => (<button key={c} onClick={() => setForm({ ...form, color: c })} className={cn('w-6 h-6 rounded-full transition-transform', form.color === c && 'ring-2 ring-offset-2 ring-sand-700')} style={{ backgroundColor: c }} />))}</div>
          </div>
        </div>
        <div><label className="text-[11px] text-ink-muted block mb-1">System Prompt</label>
          <textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} rows={3} className="w-full px-3 py-2 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint resize-none" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
        <button onClick={() => { reset(); closeModal() }} className="px-4 py-2 text-sm text-ink-muted hover:text-ink border border-border rounded-lg hover:bg-surface-hover transition-colors">Cancel</button>
        <button onClick={handleSave} className="px-4 py-2 text-sm text-white bg-sand-800 hover:bg-ink rounded-lg transition-colors">{editId ? 'Update' : 'Create'}</button>
      </div>
    </Modal>
  )
}