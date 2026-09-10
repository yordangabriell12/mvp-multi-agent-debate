import { create } from 'zustand'
import { type Agent, DEFAULT_AGENTS } from '@/types/agent'
import { generateId } from '@/lib/utils'
import { STORAGE_KEYS } from '@/lib/storage'

interface AgentState {
  agents: Agent[]
  addAgent: (agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateAgent: (id: string, updates: Partial<Agent>) => void
  removeAgent: (id: string) => void
  getAgent: (id: string) => Agent | undefined
}

function loadAgents(): Agent[] {
  if (typeof window === 'undefined') return [...DEFAULT_AGENTS]
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.agents)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return [...DEFAULT_AGENTS]
}

function saveAgents(agents: Agent[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEYS.agents, JSON.stringify(agents)) } catch { /* ignore */ }
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: loadAgents(),
  addAgent: (agentData) => {
    const id = `agent-${generateId()}`
    const now = Date.now()
    set((state) => {
      const agents = [...state.agents, { ...agentData, id, createdAt: now, updatedAt: now }]
      saveAgents(agents)
      return { agents }
    })
    return id
  },
  updateAgent: (id, updates) =>
    set((state) => {
      const agents = state.agents.map((a) =>
        a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a
      )
      saveAgents(agents)
      return { agents }
    }),
  removeAgent: (id) =>
    set((state) => {
      const agents = state.agents.filter((a) => a.id !== id)
      saveAgents(agents)
      return { agents }
    }),
  getAgent: (id) => get().agents.find((a) => a.id === id),
}))