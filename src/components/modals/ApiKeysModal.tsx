'use client'

import { useState } from 'react'
import { Modal } from './Modal'
import { useModalStore } from '@/store/modalStore'
import { useSettingsStore } from '@/store/settingsStore'
import { cn } from '@/lib/utils'

/** Outcome of a connection test, kept so the reason can be shown, not hidden. */
interface ProbeResult {
  ok: boolean
  detail: string
}

export function ApiKeysModal() {
  const activeModal = useModalStore((s) => s.activeModal)
  const closeModal = useModalStore((s) => s.closeModal)
  const { providers, updateProvider, addProvider, removeProvider, addModel, removeModel, moderatorProviderId, moderatorModelId, setModeratorProvider } = useSettingsStore()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newModelId, setNewModelId] = useState('')
  const [newModelName, setNewModelName] = useState('')
  const [addModelTo, setAddModelTo] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, ProbeResult | undefined>>({})
  const [fetchingModels, setFetchingModels] = useState<string | null>(null)
  const [modelId, setModelId] = useState('')
  const [modelName, setModelName] = useState('')

  const handleTest = async (providerId: string) => {
    const prov = providers.find((p) => p.id === providerId)
    setTesting(providerId)
    setTestResults((p) => ({ ...p, [providerId]: undefined }))

    if (!prov?.apiKey) {
      setTestResults((p) => ({ ...p, [providerId]: { ok: false, detail: 'Add an API key first.' } }))
      setTesting(null)
      return
    }
    // Without a model there is nothing to ask for, so the request would fail
    // for a reason that has nothing to do with the key.
    const modelName = prov.models[0]?.id
    if (!modelName) {
      setTestResults((p) => ({ ...p, [providerId]: { ok: false, detail: 'Add at least one model first.' } }))
      setTesting(null)
      return
    }

    setTestResults((p) => ({ ...p, [providerId]: { ok: true, detail: `Asking ${modelName}...` } }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Say OK' }],
          agent: {
            id: 'test',
            name: 'Test',
            systemPrompt: 'Reply with just OK',
            provider: prov.id,
            modelName,
          },
          providers: [prov],
        }),
      })

      if (res.ok) {
        setTestResults((p) => ({
          ...p,
          [providerId]: { ok: true, detail: `${modelName} answered successfully.` },
        }))
        return
      }

      // The route already unwraps nested provider errors, so this is the reason.
      const data = await res.json().catch(() => ({}))
      const detail = typeof data?.error === 'string' && data.error ? data.error : `Request failed with ${res.status}.`
      setTestResults((p) => ({ ...p, [providerId]: { ok: false, detail } }))
    } catch (err) {
      setTestResults((p) => ({
        ...p,
        [providerId]: {
          ok: false,
          detail: err instanceof Error ? err.message : 'Could not reach the server.',
        },
      }))
    } finally {
      setTesting(null)
    }
  }

  /**
   * Pulls the model list from the provider so ids do not have to be typed by
   * hand. Existing entries are kept: a provider can offer models it does not
   * list, and re-fetching must not delete them.
   */
  const handleFetchModels = async (providerId: string) => {
    const prov = providers.find((p) => p.id === providerId)
    if (!prov) return

    setFetchingModels(providerId)
    setTestResults((p) => ({ ...p, [providerId]: undefined }))

    try {
      const res = await fetch('/api/providers/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: prov.baseUrl, apiKey: prov.apiKey, id: prov.id }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setTestResults((p) => ({
          ...p,
          [providerId]: { ok: false, detail: data?.error || `Could not list models (${res.status}).` },
        }))
        return
      }

      const ids: string[] = Array.isArray(data?.models) ? data.models : []
      const existing = new Set(prov.models.map((m) => m.id))
      const added = ids.filter((id) => !existing.has(id))

      if (ids.length === 0) {
        setTestResults((p) => ({
          ...p,
          [providerId]: { ok: false, detail: 'The provider returned an empty model list.' },
        }))
        return
      }

      if (added.length > 0) {
        updateProvider(providerId, {
          models: [...prov.models, ...added.map((id) => ({ id, name: id }))],
        })
      }

      setTestResults((p) => ({
        ...p,
        [providerId]: {
          ok: true,
          detail:
            added.length > 0
              ? `Added ${added.length} model${added.length === 1 ? '' : 's'}.`
              : 'All listed models were already added.',
        },
      }))
    } catch {
      setTestResults((p) => ({
        ...p,
        [providerId]: { ok: false, detail: 'Could not reach the server.' },
      }))
    } finally {
      setFetchingModels(null)
    }
  }
  if (activeModal !== 'apiKeys') return null

  const handleAddProvider = () => {
    if (!newName.trim() || !newUrl.trim()) return
    const models = []
    if (newModelId.trim() && newModelName.trim()) {
      models.push({ id: newModelId.trim(), name: newModelName.trim() })
    }
    addProvider({ name: newName.trim(), baseUrl: newUrl.trim(), apiKey: newKey.trim(), models, enabled: !!newKey.trim() })
    setNewName(''); setNewUrl(''); setNewKey(''); setNewModelId(''); setNewModelName(''); setShowAdd(false)
  }

  const handleAddModel = (providerId: string) => {
    if (!modelId.trim() || !modelName.trim()) return
    addModel(providerId, { id: modelId.trim(), name: modelName.trim() })
    setModelId(''); setModelName(''); setAddModelTo(null)
  }

  return (
    <Modal open onClose={closeModal} title="API Providers" description="Configure your API endpoints, keys, and models." maxWidth="max-w-xl">
      {/* Moderator Provider Section */}
      <div className="mb-4 p-3 bg-surface-inset border border-border rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-full bg-ink flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M3 20h18M6 20v-9l-2 1v-2l2-1V5c0-1 .5-2 2-2h4c1.5 0 2 1 2 2v4l2 1v2l-2-1v9M10 4v.01M14 10.5v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-ink">Moderator</span>
          <span className="text-[10px] text-ink-muted">Dedicated provider for the AI moderator</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-ink-muted block mb-1">Provider</label>
            <select
              value={moderatorProviderId}
              onChange={(e) => {
                const prov = providers.find((p) => p.id === e.target.value)
                const firstModel = prov?.models[0]?.id || ''
                setModeratorProvider(e.target.value, firstModel)
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-md focus:outline-none focus:border-ink-faint"
            >
              <option value="">Auto (first available)</option>
              {providers.filter((p) => p.apiKey).map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.models.length} models)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-ink-muted block mb-1">Model</label>
            <select
              value={moderatorModelId}
              onChange={(e) => setModeratorProvider(moderatorProviderId, e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-md focus:outline-none focus:border-ink-faint"
            >
              {(providers.find((p) => p.id === moderatorProviderId)?.models || []).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
              {!moderatorProviderId && <option value="">Auto</option>}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {providers.map((provider) => {
          const isExpanded = expanded === provider.id
          const hasKey = !!provider.apiKey
          return (
            <div key={provider.id} className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(isExpanded ? null : provider.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-left"
              >
                <div className={cn('w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0', hasKey ? 'bg-sage-light text-sage' : 'bg-surface-inset text-ink-muted')}>
                  {provider.name.slice(0, 3).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink">{provider.name}</div>
                  <div className="text-[11px] text-ink-muted truncate">{provider.baseUrl}</div>
                </div>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded', hasKey ? 'bg-sage-light text-sage' : 'bg-surface-inset text-ink-muted')}>
                  {provider.models.length} models
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={cn('text-ink-muted transition-transform', isExpanded && 'rotate-180')}>
                  <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                  <div>
                    <label className="text-[11px] text-ink-muted block mb-1">Name</label>
                    <input value={provider.name} onChange={(e) => updateProvider(provider.id, { name: e.target.value })} className="w-full px-3 py-1.5 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint" />
                  </div>
                  <div>
                    <label className="text-[11px] text-ink-muted block mb-1">Base URL</label>
                    <input value={provider.baseUrl} onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })} placeholder="https://api.example.com/v1" className="w-full px-3 py-1.5 text-sm font-mono bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint" />
                  </div>
                  <div>
                    <label className="text-[11px] text-ink-muted block mb-1">API Key</label>
                    <input type="password" value={provider.apiKey} onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })} placeholder="sk-..." className="w-full px-3 py-1.5 text-sm font-mono bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint" />
                  </div>

                  <div className="flex items-start gap-2 flex-wrap">
                    <button
                      onClick={() => handleTest(provider.id)}
                      disabled={!hasKey || provider.models.length === 0 || testing === provider.id}
                      className="px-3 py-1.5 text-[11px] text-ink-muted border border-border rounded-md hover:text-ink hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {testing === provider.id ? 'Testing...' : 'Test connection'}
                    </button>
                    <button
                      onClick={() => handleFetchModels(provider.id)}
                      disabled={!hasKey || fetchingModels === provider.id}
                      title="Fetch the model list from this provider"
                      className="px-3 py-1.5 text-[11px] text-ink-muted border border-border rounded-md hover:text-ink hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {fetchingModels === provider.id ? 'Fetching...' : 'Fetch models'}
                    </button>
                    {!hasKey && <span className="text-[11px] text-ink-muted py-1.5">Add a key first</span>}
                  </div>

                  {testResults[provider.id] && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={cn(
                        'text-[11px] rounded-md border px-2.5 py-2 leading-relaxed break-words',
                        testResults[provider.id]?.ok
                          ? 'text-sage border-sage/30 bg-sage-light'
                          : 'text-rust border-rust/30 bg-rust-light'
                      )}
                    >
                      {testResults[provider.id]?.ok ? 'Connection OK. ' : 'Failed. '}
                      {testResults[provider.id]?.detail}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] text-ink-muted">Models</label>
                      <button onClick={() => setAddModelTo(addModelTo === provider.id ? null : provider.id)} className="text-[10px] text-ink-muted hover:text-ink transition-colors">+ add model</button>
                    </div>
                    <div className="space-y-1">
                      {provider.models.map((model) => (
                        <div key={model.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-surface-inset rounded-md group">
                          <span className="text-xs text-ink flex-1 truncate">{model.name}</span>
                          <span className="text-[10px] text-ink-muted font-mono">{model.id}</span>
                          <button onClick={() => removeModel(provider.id, model.id)} className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-red-600 transition-all">
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                          </button>
                        </div>
                      ))}
                      {provider.models.length === 0 && <p className="text-[11px] text-ink-muted py-2 text-center">No models added yet</p>}
                    </div>
                    {addModelTo === provider.id && (
                      <div className="flex gap-1.5 mt-2">
                        <input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="model-id" className="flex-1 px-2 py-1 text-[11px] font-mono bg-surface-inset border border-border rounded focus:outline-none focus:border-ink-faint" />
                        <input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="Display name" className="flex-1 px-2 py-1 text-[11px] bg-surface-inset border border-border rounded focus:outline-none focus:border-ink-faint" />
                        <button onClick={() => handleAddModel(provider.id)} className="px-2 py-1 text-[11px] text-white bg-sand-800 rounded hover:bg-ink transition-colors">Add</button>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button onClick={() => { removeProvider(provider.id); setExpanded(null) }} className="text-[11px] text-red-500 hover:text-red-700 transition-colors">Remove provider</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {showAdd ? (
          <div className="border border-border-strong rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-ink-muted">Add Custom Provider</div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Provider name" className="w-full px-3 py-1.5 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint" />
            <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="Base URL (e.g. https://my-api.com/v1)" className="w-full px-3 py-1.5 text-sm font-mono bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint" />
            <input type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="API Key (optional, can add later)" className="w-full px-3 py-1.5 text-sm font-mono bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint" />
            <div className="border-t border-border pt-2 mt-2">
              <div className="text-[11px] text-ink-muted mb-1.5">First model (optional, can add more later)</div>
              <div className="flex gap-1.5">
                <input value={newModelId} onChange={(e) => setNewModelId(e.target.value)} placeholder="model-id" className="flex-1 px-2 py-1.5 text-[11px] font-mono bg-surface-inset border border-border rounded focus:outline-none focus:border-ink-faint" />
                <input value={newModelName} onChange={(e) => setNewModelName(e.target.value)} placeholder="Display name" className="flex-1 px-2 py-1.5 text-[11px] bg-surface-inset border border-border rounded focus:outline-none focus:border-ink-faint" />
              </div>
            </div>
            <div className="flex justify-end gap-1.5">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1 text-xs text-ink-muted hover:text-ink transition-colors">Cancel</button>
              <button onClick={handleAddProvider} className="px-3 py-1 text-xs text-white bg-sand-800 rounded hover:bg-ink transition-colors">Add</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs text-ink-muted border border-dashed border-border rounded-lg hover:border-border-strong hover:bg-surface-hover transition-colors">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            Add custom provider
          </button>
        )}
      </div>

      <div className="flex justify-end mt-4 pt-4 border-t border-border">
        <button onClick={closeModal} className="px-4 py-2 text-sm text-white bg-sand-800 hover:bg-ink rounded-lg transition-colors">Done</button>
      </div>
    </Modal>
  )
}
