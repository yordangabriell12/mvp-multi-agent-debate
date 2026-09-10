'use client'

import { useEffect } from 'react'
import { Modal } from './Modal'
import { useModalStore } from '@/store/modalStore'
import { useAgentStore } from '@/store/agentStore'
import { useSettingsStore } from '@/store/settingsStore'
import { cn } from '@/lib/utils'

export function ModelsModal() {
  const activeModal = useModalStore((s) => s.activeModal)
  const closeModal = useModalStore((s) => s.closeModal)
  const { agents, updateAgent } = useAgentStore()
  const providers = useSettingsStore((s) => s.providers)

  // Auto-heal: reassign agents whose provider no longer exists
  useEffect(() => {
    if (activeModal !== 'models') return
    const providerIds = new Set(providers.map((p) => p.id))
    const fallback = providers.find((p) => p.apiKey) || providers[0]
    const fallbackModel = fallback?.models[0]?.id || ''
    for (const a of agents) {
      if (!providerIds.has(a.model.provider) || !a.model.modelName) {
        updateAgent(a.id, {
          model: {
            provider: fallback?.id || 'openai',
            modelName: a.model.modelName && providerIds.has(a.model.provider) ? a.model.modelName : fallbackModel,
          },
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModal])

  if (activeModal !== 'models') return null

  const handleProviderChange = (agentId: string, providerId: string) => {
    const prov = providers.find((p) => p.id === providerId)
    const firstModel = prov?.models[0]
    updateAgent(agentId, {
      model: {
        provider: providerId,
        modelName: firstModel?.id || '',
      },
    })
  }

  return (
    <Modal open onClose={closeModal} title="AI Models" description="Configure which provider and model each agent uses." maxWidth="max-w-xl">
      <div className="space-y-3">
        {agents.map((agent) => {
          const provider = providers.find((p) => p.id === agent.model.provider)
          const providerModels = provider?.models || []
          const hasKey = !!provider?.apiKey
          const currentModelValid = providerModels.some((m) => m.id === agent.model.modelName)

          return (
            <div key={agent.id} className="border border-border rounded-lg p-3">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white shrink-0" style={{ backgroundColor: agent.avatarColor }}>
                  {agent.name[0]}
                </div>
                <div className="text-xs font-medium text-ink">{agent.name}</div>
                <div className="text-[10px] text-ink-faint truncate">{agent.roleTitle}</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Provider select */}
                <div>
                  <label className="text-[10px] text-ink-faint block mb-1">Provider</label>
                  <select
                    value={agent.model.provider}
                    onChange={(e) => handleProviderChange(agent.id, e.target.value)}
                    className={cn('w-full px-2.5 py-1.5 text-xs bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint', !hasKey && 'text-ink-faint')}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.apiKey ? '' : ' (no key)'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Model select — auto-populated from provider */}
                <div>
                  <label className="text-[10px] text-ink-faint block mb-1">Model</label>
                  <select
                    value={agent.model.modelName}
                    onChange={(e) => updateAgent(agent.id, { model: { ...agent.model, modelName: e.target.value } })}
                    className="w-full px-2.5 py-1.5 text-xs bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint"
                  >
                    {providerModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                    {!currentModelValid && agent.model.modelName && (
                      <option value={agent.model.modelName}>{agent.model.modelName}</option>
                    )}
                    {providerModels.length === 0 && <option value="">No models — add in API Keys</option>}
                  </select>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-end mt-4 pt-4 border-t border-border">
        <button onClick={closeModal} className="px-4 py-2 text-sm text-white bg-sand-800 hover:bg-ink rounded-lg transition-colors">Done</button>
      </div>
    </Modal>
  )
}
