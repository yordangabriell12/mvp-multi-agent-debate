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
 * The preferred model is found by **model id**, not by provider id, and that distinction was
 * learned from a real deployment. A DeepSeek provider is usually added by hand, so it carries
 * a generated id like `provider-1789053885439-esckrh9` rather than the preset `deepseek`, and
 * its model list may put `deepseek-chat` first. Matching on the provider id alone therefore
 * missed a provider that had `deepseek-flash` sitting right there, and the agent silently got
 * a different model than the one asked for.
 *
 * The order below is: the preferred model wherever it lives, then the preferred provider
 * under another model, then any configured provider, then the preferred name as a last
 * resort so a fresh install and an established one agree.
 */
export function pickDefaultModel(providers: ProviderConfig[]): DefaultModelChoice {
  const withKey = providers.filter(providerHasKey)

  // 1. A configured provider that carries the preferred model. Matched by model id, so a
  //    hand-added provider entry is found even though its id is generated.
  const carriesPreferred = withKey.find((provider) =>
    provider.models.some((model) => model.id === PREFERRED_DEFAULT_MODEL.modelName)
  )
  if (carriesPreferred) {
    return { provider: carriesPreferred.id, modelName: PREFERRED_DEFAULT_MODEL.modelName }
  }

  // 2. The preferred provider itself, whether that is its id or its display name, using its
  //    first model. Reached when the headline model has been renamed or removed.
  const preferredProvider = withKey.find(
    (provider) =>
      provider.id === PREFERRED_DEFAULT_MODEL.provider ||
      provider.name.trim().toLowerCase() === PREFERRED_DEFAULT_MODEL.provider
  )
  if (preferredProvider?.models[0]) {
    return { provider: preferredProvider.id, modelName: preferredProvider.models[0].id }
  }

  // 3. Any configured provider, so a deployment that never added DeepSeek still gets a working
  //    agent rather than a dangling reference.
  const anyConfigured = withKey.find((provider) => provider.models[0])
  if (anyConfigured) {
    return { provider: anyConfigured.id, modelName: anyConfigured.models[0].id }
  }

  // 4. Nothing is configured at all. The preferred model is returned rather than the first
  //    provider in the list, so a new agent matches the built-in agents instead of
  //    disagreeing with them: they are hardcoded to DeepSeek, and having the three agents
  //    you start with on one provider and every agent you create on another is the kind of
  //    inconsistency that reads as a bug. Nothing works until a key is added anyway, and the
  //    settings screen is where that happens.
  return { ...PREFERRED_DEFAULT_MODEL }
}
