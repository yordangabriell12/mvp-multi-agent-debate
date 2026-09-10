import { create } from 'zustand'

type Resolver = (answer: string) => void

interface PendingState {
  resolvers: Record<string, Resolver | undefined>
  waitForAnswer: (sessionId: string) => Promise<string>
  takeResolver: (sessionId: string) => Resolver | undefined
}

export const usePendingStore = create<PendingState>((set, get) => ({
  resolvers: {},
  waitForAnswer: (sessionId) =>
    new Promise<string>((resolve) => {
      set((state) => ({ resolvers: { ...state.resolvers, [sessionId]: resolve } }))
    }),
  takeResolver: (sessionId) => {
    const r = get().resolvers[sessionId]
    if (r) {
      set((state) => {
        const resolvers = { ...state.resolvers }
        delete resolvers[sessionId]
        return { resolvers }
      })
    }
    return r
  },
}))

