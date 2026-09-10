// Client helper for the "improve text" action.
//
// Picks a model to do the rewriting: the moderator's model when one is chosen,
// otherwise the first provider that has a key. The request goes through
// /api/improve so the API key never reaches the provider straight from here.

import { useSettingsStore } from '@/store/settingsStore'

export interface ImproveResult {
  ok: boolean
  text?: string
  error?: string
}

function pickModel(): { provider: string; modelName: string } | null {
  const { providers, moderatorProviderId, moderatorModelId } = useSettingsStore.getState()

  const moderatorProvider = providers.find((p) => p.id === moderatorProviderId && p.apiKey)
  if (moderatorProvider && moderatorModelId) {
    return { provider: moderatorProvider.id, modelName: moderatorModelId }
  }

  const usable = providers.find((p) => p.apiKey && p.models.length > 0)
  if (!usable) return null
  return { provider: usable.id, modelName: usable.models[0].id }
}

export async function improveText(
  text: string,
  mode: 'chat' | 'persona'
): Promise<ImproveResult> {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'Nothing to improve yet.' }

  const model = pickModel()
  if (!model) {
    return { ok: false, error: 'Add an API key first, in API Keys.' }
  }

  try {
    const res = await fetch('/api/improve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: trimmed,
        mode,
        provider: model.provider,
        modelName: model.modelName,
        providers: useSettingsStore.getState().providers.filter((p) => p.apiKey),
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error || 'Could not improve the text.' }

    const improved = String(data?.improved ?? '').trim()
    if (!improved) return { ok: false, error: 'The model returned an empty rewrite.' }
    return { ok: true, text: improved }
  } catch {
    return { ok: false, error: 'Could not reach the server.' }
  }
}
