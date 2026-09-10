import { create } from 'zustand'
import { type ProviderConfig, PRESET_PROVIDERS } from '@/types/provider'
import { useAgentStore } from '@/store/agentStore'
import { generateId } from '@/lib/utils'

interface SettingsState {
  providers: ProviderConfig[]
  moderatorProviderId: string
  moderatorModelId: string
  addProvider: (provider: Omit<ProviderConfig, 'id'>) => string
  updateProvider: (id: string, updates: Partial<ProviderConfig>) => void
  removeProvider: (id: string) => void
  addModel: (providerId: string, model: { id: string; name: string }) => void
  removeModel: (providerId: string, modelId: string) => void
  setModeratorProvider: (providerId: string, modelId: string) => void
}

function loadProviders(): ProviderConfig[] {
  if (typeof window === 'undefined') return PRESET_PROVIDERS.map((p) => ({ ...p, apiKey: '' }))
  try {
    const raw = localStorage.getItem('vma-providers')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return PRESET_PROVIDERS.map((p) => ({ ...p, apiKey: '' }))
}

function saveProviders(providers: ProviderConfig[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem('vma-providers', JSON.stringify(providers)) } catch { /* ignore */ }
}

function loadModeratorSettings(): { providerId: string; modelId: string } {
  if (typeof window === 'undefined') return { providerId: '', modelId: '' }
  try {
    const raw = localStorage.getItem('vma-moderator')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { providerId: '', modelId: '' }
}

function saveModeratorSettings(settings: { providerId: string; modelId: string }) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem('vma-moderator', JSON.stringify(settings)) } catch { /* ignore */ }
}

const modSettings = loadModeratorSettings()

export const useSettingsStore = create<SettingsState>((set) => ({
  providers: loadProviders(),
  moderatorProviderId: modSettings.providerId,
  moderatorModelId: modSettings.modelId,

  addProvider: (data) => {
    const id = `provider-${generateId()}`
    set((state) => {
      const providers = [...state.providers, { ...data, id }]
      saveProviders(providers)
      return { providers }
    })
    return id
  },

  updateProvider: (id, updates) =>
    set((state) => {
      const providers = state.providers.map((p) => (p.id === id ? { ...p, ...updates } : p))
      saveProviders(providers)
      return { providers }
    }),

  removeProvider: (id) =>
    set((state) => {
      const providers = state.providers.filter((p) => p.id !== id)
      saveProviders(providers)
      // Cascade: reassign any agent that was pointing at the removed provider
      const fallback = providers.find((p) => p.apiKey) || providers[0]
      const fallbackModel = fallback?.models[0]?.id || ''
      const agentStore = useAgentStore.getState()
      for (const a of agentStore.agents) {
        if (a.model.provider === id) {
          agentStore.updateAgent(a.id, {
            model: { provider: fallback?.id || 'openai', modelName: fallbackModel },
          })
        }
      }
      return { providers }
    }),

  addModel: (providerId, model) =>
    set((state) => {
      const providers = state.providers.map((p) =>
        p.id === providerId ? { ...p, models: [...p.models, model] } : p
      )
      saveProviders(providers)
      return { providers }
    }),

  removeModel: (providerId, modelId) =>
    set((state) => {
      const providers = state.providers.map((p) =>
        p.id === providerId ? { ...p, models: p.models.filter((m) => m.id !== modelId) } : p
      )
      saveProviders(providers)
      return { providers }
    }),

  setModeratorProvider: (providerId, modelId) => {
    saveModeratorSettings({ providerId, modelId })
    set({ moderatorProviderId: providerId, moderatorModelId: modelId })
  },
}))