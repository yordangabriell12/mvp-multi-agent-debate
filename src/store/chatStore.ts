import { create } from 'zustand'
import type { Message } from '@/types/message'
import { generateId } from '@/lib/utils'
import { STORAGE_KEYS, safeSetItem } from '@/lib/storage'

interface ChatState {
  messages: Record<string, Message[]>
  /** Set when a write to localStorage fails, so the UI can warn the user. */
  persistenceError: string | null
  addMessage: (sessionId: string, message: Omit<Message, 'id' | 'createdAt'>) => string
  getMessages: (sessionId: string) => Message[]
  clearMessages: (sessionId: string) => void
  dismissPersistenceError: () => void
}

function loadMessages(): Record<string, Message[]> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.messages)
    if (raw) return JSON.parse(raw)
  } catch { /* corrupt payload: start clean rather than crash on boot */ }
  return {}
}

function persistMessages(messages: Record<string, Message[]>): string | null {
  const result = safeSetItem(STORAGE_KEYS.messages, JSON.stringify(messages))
  return result.ok ? null : result.error ?? 'Could not save to browser storage.'
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: loadMessages(),
  persistenceError: null,

  addMessage: (sessionId, messageData) => {
    const id = `msg-${generateId()}`
    const message: Message = {
      ...messageData,
      id,
      sessionId,
      createdAt: Date.now(),
    }
    set((state) => {
      const messages = {
        ...state.messages,
        [sessionId]: [...(state.messages[sessionId] || []), message],
      }
      return { messages, persistenceError: persistMessages(messages) }
    })
    return id
  },

  getMessages: (sessionId) => get().messages[sessionId] || [],

  clearMessages: (sessionId) =>
    set((state) => {
      const messages = {
        ...state.messages,
        [sessionId]: [],
      }
      return { messages, persistenceError: persistMessages(messages) }
    }),

  dismissPersistenceError: () => set({ persistenceError: null }),
}))

