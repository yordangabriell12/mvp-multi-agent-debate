import { create } from 'zustand'
import type { Message } from '@/types/message'
import { generateId } from '@/lib/utils'

interface ChatState {
  messages: Record<string, Message[]>
  addMessage: (sessionId: string, message: Omit<Message, 'id' | 'createdAt'>) => string
  getMessages: (sessionId: string) => Message[]
  clearMessages: (sessionId: string) => void
}

function loadMessages(): Record<string, Message[]> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem('vma-messages')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveMessages(messages: Record<string, Message[]>) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem('vma-messages', JSON.stringify(messages)) } catch { /* ignore */ }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: loadMessages(),

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
      saveMessages(messages)
      return { messages }
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
      saveMessages(messages)
      return { messages }
    }),
}))
