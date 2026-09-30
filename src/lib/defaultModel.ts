// Which model a newly created agent starts on.
//
// This used to be "the first model of the first provider that has a key", which read as a
// sensible fallback and behaved badly: the first provider in the list is OpenAI, so a
// deployment set up on DeepSeek still created every new agent on `gpt-4o`, and the agent
// failed on its first turn with a provider error. The dialog was also the fourth place the
// same choice was made, each with its own idea of the default.
//
// So there is one answer here: a named preferred model when it is available, and the
// first configured provider only as a fallback.

import { providerHasKey, type ProviderConfig } from '@/types/provider'

/**
 * The provider and model a new agent should start on.
 *
 * Named explicitly rather than reusing a preset's first entry, because the presets
 * list models for humans to choose from and their order is not a recommendation.
 */
export const PREFERRED_DEFAULT_MODEL = { provider: 'deepseek', modelName: 'deepseek-flash' }

export interface DefaultModelChoice {
  provider: string
  modelName: string
}

/**
 * Picks the default model for a new agent.
 *
 * The preferred model wins when that provider is configured. Otherwise the first
 * provider with a key is used, so a deployment that never added DeepSeek still gets a
 * working agent rather than a dangling reference. Falls back to the first provider at
 * all, which is what the old code did unconditionally.
 */
export function pickDefaultModel(providers: ProviderConfig[]): DefaultModelChoice {
  const withKey = providers.filter(providerHasKey)

  const preferred = withKey.find(
    (provider) =>
      provider.id === PREFERRED_DEFAULT_MODEL.provider &&
      provider.models.some((model) => model.id === PREFERRED_DEFAULT_MODEL.modelName)
  )
  if (preferred) return { ...PREFERRED_DEFAULT_MODEL }

  // The preferred name is a suggestion, not a requirement: a provider that carries it
  // but under a different id is still a better answer than an unrelated provider.
  const preferredProvider = withKey.find(
    (provider) => provider.id === PREFERRED_DEFAULT_MODEL.provider
  )
  if (preferredProvider?.models[0]) {
    return { provider: preferredProvider.id, modelName: preferredProvider.models[0].id }
  }

  const anyConfigured = withKey.find((provider) => provider.models[0])
  if (anyConfigured) {
    return { provider: anyConfigured.id, modelName: anyConfigured.models[0].id }
  }

  // Nothing is configured at all. The preferred model is returned rather than the first
  // provider in the list, so a new agent matches the built-in agents instead of
  // disagreeing with them: they are hardcoded to DeepSeek, and having the three agents
  // you start with on one provider and every agent you create on another is the kind of
  // inconsistency that reads as a bug. Nothing works until a key is added anyway, and the
  // settings screen is where that happens.
  return { ...PREFERRED_DEFAULT_MODEL }
}
