// Tests for picking the model a new agent starts on.
//
// The regression: the old rule was "first model of the first provider with a key", and
// the provider list starts with OpenAI. So a DeepSeek deployment created every new agent
// on gpt-4o, and the agent errored on its first turn with a provider it had no key for.

import { describe, it, expect } from 'vitest'
import { pickDefaultModel, PREFERRED_DEFAULT_MODEL } from '@/lib/defaultModel'
import type { ProviderConfig } from '@/types/provider'

function provider(
  id: string,
  models: string[],
  options: { hasKey?: boolean } = {}
): ProviderConfig {
  return {
    id,
    name: id,
    baseUrl: 'https://example.test/v1',
    apiKey: options.hasKey ? 'sk-test' : '',
    models: models.map((modelId) => ({ id: modelId, name: modelId })),
    enabled: true,
  }
}

describe('pickDefaultModel', () => {
  it('prefers DeepSeek flash when that provider is configured', () => {
    const providers = [
      provider('openai', ['gpt-4o'], { hasKey: true }),
      provider('deepseek', ['deepseek-flash', 'deepseek-v4-pro'], { hasKey: true }),
    ]

    expect(pickDefaultModel(providers)).toEqual(PREFERRED_DEFAULT_MODEL)
  })

  it('does not pick a provider that has no key', () => {
    const providers = [
      provider('openai', ['gpt-4o'], { hasKey: true }),
      provider('deepseek', ['deepseek-flash']),
    ]

    // DeepSeek is listed but unusable, so the configured provider wins rather than the
    // preferred name.
    expect(pickDefaultModel(providers)).toEqual({ provider: 'openai', modelName: 'gpt-4o' })
  })

  it('accepts an admin copy where the key is present as apiKey', () => {
    const providers = [
      provider('openai', ['gpt-4o'], { hasKey: true }),
      provider('deepseek', ['deepseek-flash'], { hasKey: true }),
    ]
    expect(pickDefaultModel(providers).provider).toBe('deepseek')
  })

  /**
   * The case a real deployment exposed: a DeepSeek provider added by hand carries a generated
   * id and may list `deepseek-chat` first. Matching on the provider id alone missed it and the
   * new agent silently got `deepseek-chat` instead of the flash model.
   */
  it('finds the preferred model on a hand-added provider with a generated id', () => {
    const providers = [
      provider('openai', ['gpt-4o'], { hasKey: true }),
      provider('provider-1789053885439-esckrh9', ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash', 'deepseek-v4-pro'], { hasKey: true }),
    ]

    // Named after the deployment's provider, so the intent is readable.
    const actual = pickDefaultModel(providers)
    expect(actual.modelName).toBe('deepseek-flash')
    expect(actual.provider).toBe('provider-1789053885439-esckrh9')
  })

  it('matches the preferred provider by display name when the id is generated', () => {
    const providers = [
      provider('openai', ['gpt-4o'], { hasKey: true }),
      provider('provider-999', ['deepseek-chat', 'deepseek-reasoner'], { hasKey: true }),
    ]
    // No flash model, but this is still the DeepSeek provider, so its first model wins over
    // jumping to OpenAI.
    providers[1].name = 'DeepSeek'
    expect(pickDefaultModel(providers)).toEqual({ provider: 'provider-999', modelName: 'deepseek-chat' })
  })

  it('prefers the model over the provider when they disagree', () => {
    const providers = [
      provider('openrouter', ['deepseek-flash'], { hasKey: true }),
      provider('deepseek', ['deepseek-chat'], { hasKey: true }),
    ]
    // The model is what was asked for, so the provider serving it wins.
    expect(pickDefaultModel(providers)).toEqual({ provider: 'openrouter', modelName: 'deepseek-flash' })
  })

  it('accepts a client copy where only hasKey is set', () => {
    const providers: ProviderConfig[] = [
      {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: '',
        hasKey: true,
        models: [{ id: 'deepseek-flash', name: 'Flash' }],
        enabled: true,
      },
    ]
    expect(pickDefaultModel(providers)).toEqual(PREFERRED_DEFAULT_MODEL)
  })

  it('uses another model on the preferred provider when the exact id is gone', () => {
    const providers = [
      provider('openai', ['gpt-4o'], { hasKey: true }),
      provider('deepseek', ['deepseek-v4-pro'], { hasKey: true }),
    ]

    // A renamed model should still land on DeepSeek rather than jumping to OpenAI.
    expect(pickDefaultModel(providers)).toEqual({
      provider: 'deepseek',
      modelName: 'deepseek-v4-pro',
    })
  })

  it('falls back to the first configured provider when DeepSeek is absent', () => {
    const providers = [
      provider('openai', ['gpt-4o'], { hasKey: true }),
      provider('anthropic', ['claude-sonnet-4-20250514'], { hasKey: true }),
    ]

    expect(pickDefaultModel(providers)).toEqual({ provider: 'openai', modelName: 'gpt-4o' })
  })

  it('falls back to any provider at all when none has a key', () => {
    const providers = [provider('openai', ['gpt-4o'])]
    // Not "the first provider in the list": a new agent should match the built-in agents,
    // which are on DeepSeek, rather than disagreeing with them.
    expect(pickDefaultModel(providers)).toEqual(PREFERRED_DEFAULT_MODEL)
  })

  it('returns the preferred model on a fresh install with no providers', () => {
    expect(pickDefaultModel([])).toEqual(PREFERRED_DEFAULT_MODEL)
  })

  it('skips a configured provider that has no models', () => {
    const providers = [
      provider('openai', [], { hasKey: true }),
      provider('deepseek', ['deepseek-flash'], { hasKey: true }),
    ]
    // An empty provider list must not be chosen just because it appears first.
    expect(pickDefaultModel(providers)).toEqual(PREFERRED_DEFAULT_MODEL)
  })

  it('falls back to a configured provider that is not the preferred one and has no key elsewhere', () => {
    const providers = [provider('openai', [], { hasKey: true }), provider('ollama', ['llama3'])]
    // Ollama has a model but no key, and the provider with a key has no models, so there
    // is nothing usable. The preferred model is the consistent answer.
    expect(pickDefaultModel(providers)).toEqual(PREFERRED_DEFAULT_MODEL)
  })
})
