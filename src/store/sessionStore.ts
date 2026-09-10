import { create } from 'zustand'
import { type Session, type PresetMode, type ResponseMode, type SessionSettings } from '@/types/session'
import { DEFAULT_AGENTS } from '@/types/agent'
import { useChatStore } from '@/store/chatStore'
import { generateId } from '@/lib/utils'

interface SessionState {
  sessions: Session[]
  activeSessionId: string | null
  createSession: (name: string, presetMode?: PresetMode) => string
  updateSession: (id: string, updates: Partial<Session>) => void
  renameSession: (id: string, name: string) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string) => void
  getActiveSession: () => Session | undefined
  setResponseMode: (id: string, mode: ResponseMode) => void
  setSettings: (id: string, settings: Partial<SessionSettings>) => void
  kickAgent: (sessionId: string, agentId: string) => void
  inviteAgent: (sessionId: string, agentId: string) => void
}

const DEFAULT_SETTINGS: SessionSettings = {
  loopSpeed: 'normal',
  maxRounds: 'unlimited',
  moderatorEnabled: false,
  roleLock: false,
}

function loadSessions(): { sessions: Session[]; activeSessionId: string | null } {
  if (typeof window === 'undefined') return { sessions: [], activeSessionId: null }
  try {
    const raw = localStorage.getItem('vma-sessions')
    const rawId = localStorage.getItem('vma-active-session')
    if (raw) {
      const sessions = JSON.parse(raw)
      return { sessions, activeSessionId: rawId || (sessions[0]?.id ?? null) }
    }
  } catch { /* ignore */ }
  return { sessions: [], activeSessionId: null }
}

function saveSessions(sessions: Session[], activeSessionId: string | null) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('vma-sessions', JSON.stringify(sessions))
    if (activeSessionId) localStorage.setItem('vma-active-session', activeSessionId)
  } catch { /* ignore */ }
}

const initial = loadSessions()

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: initial.sessions,
  activeSessionId: initial.activeSessionId,

  createSession: (name, presetMode = 'boardroom') => {
    const id = `session-${generateId()}`
    const now = Date.now()
    const session: Session = {
      id,
      name,
      agentIds: DEFAULT_AGENTS.map((a) => a.id),
      presetMode,
      settings: { ...DEFAULT_SETTINGS },
      status: 'idle',
      currentRound: 0,
      responseMode: 'tag',
      createdAt: now,
      updatedAt: now,
    }
    set((state) => {
      const sessions = [session, ...state.sessions]
      const activeSessionId = id
      saveSessions(sessions, activeSessionId)
      return { sessions, activeSessionId }
    })
    return id
  },

  updateSession: (id, updates) =>
    set((state) => {
      const sessions = state.sessions.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
      )
      saveSessions(sessions, state.activeSessionId)
      return { sessions }
    }),

  renameSession: (id, name) =>
    set((state) => {
      const sessions = state.sessions.map((s) =>
        s.id === id ? { ...s, name, updatedAt: Date.now() } : s
      )
      saveSessions(sessions, state.activeSessionId)
      return { sessions }
    }),

  removeSession: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id)
      const activeSessionId = state.activeSessionId === id
        ? (sessions[0]?.id ?? null)
        : state.activeSessionId
      saveSessions(sessions, activeSessionId)
      // Drop the conversation too. Without this the messages stayed in
      // localStorage forever and kept filling the 5 MB budget.
      useChatStore.getState().clearMessages(id)
      return { sessions, activeSessionId }
    }),

  setActiveSession: (id) => {
    set({ activeSessionId: id })
    saveSessions(get().sessions, id)
  },

  getActiveSession: () => {
    const state = get()
    return state.sessions.find((s) => s.id === state.activeSessionId)
  },

  setResponseMode: (id, mode) =>
    set((state) => {
      const sessions = state.sessions.map((s) =>
        s.id === id ? { ...s, responseMode: mode, updatedAt: Date.now() } : s
      )
      saveSessions(sessions, state.activeSessionId)
      return { sessions }
    }),

  setSettings: (id, settings) =>
    set((state) => {
      const sessions = state.sessions.map((s) =>
        s.id === id
          ? { ...s, settings: { ...s.settings, ...settings }, updatedAt: Date.now() }
          : s
      )
      saveSessions(sessions, state.activeSessionId)
      return { sessions }
    }),

  kickAgent: (sessionId, agentId) =>
    set((state) => {
      const sessions = state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, agentIds: s.agentIds.filter((id) => id !== agentId), updatedAt: Date.now() }
          : s
      )
      saveSessions(sessions, state.activeSessionId)
      return { sessions }
    }),

  inviteAgent: (sessionId, agentId) =>
    set((state) => {
      const sessions = state.sessions.map((s) =>
        s.id === sessionId && !s.agentIds.includes(agentId)
          ? { ...s, agentIds: [...s.agentIds, agentId], updatedAt: Date.now() }
          : s
      )
      saveSessions(sessions, state.activeSessionId)
      return { sessions }
    }),
}))