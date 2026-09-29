// Tests for the key-stripping boundary.
//
// `providersFor` is the single place that decides whether an account receives its
// provider API keys. If it ever returns them to a non-admin, every promise about
// hidden keys is void, so it is worth testing directly rather than only through a
// route.

import { describe, it, expect } from 'vitest'
import { providersFor } from '@/lib/serverStore'
import type { ProviderConfig } from '@/types/provider'

function provider(id: string, apiKey: string): ProviderConfig {
  return {
    id,
    name: id,
    baseUrl: `https://${id}.example.com/v1`,
    apiKey,
    models: [{ id: `${id}-model`, name: 'Model' }],
    enabled: true,
  }
}

describe('providersFor', () => {
  it('keeps keys for an admin, who owns them', () => {
    const result = providersFor([provider('openai', 'sk-secret')], true)
    expect(result[0].apiKey).toBe('sk-secret')
  })

  it('reports hasKey for an admin too, so callers need not know who is asking', () => {
    // The field is always present, including for the account whose key is
    // visible. A UI that asks "is this provider configured" should not have to
    // first work out whether it is looking at an admin's copy.
    const result = providersFor([provider('openai', 'sk-secret')], true)
    expect(result[0].hasKey).toBe(true)
  })

  it('strips the key for everyone else and reports hasKey instead', () => {
    const result = providersFor([provider('openai', 'sk-secret')], false)
    expect(result[0].apiKey).toBe('')
    expect(result[0].hasKey).toBe(true)
  })

  it('does not leak the key anywhere else in the object', () => {
    // The whole object is serialised to the client, so the assertion is on the
    // serialised form rather than on one field: a key copied into another
    // property would otherwise pass.
    const result = providersFor([provider('openai', 'sk-secret')], false)
    expect(JSON.stringify(result)).not.toContain('sk-secret')
  })

  it('marks a provider with no key as not configured', () => {
    const result = providersFor([provider('deepseek', '')], false)
    expect(result[0].hasKey).toBe(false)
    expect(result[0].apiKey).toBe('')
  })

  it('keeps the rest of the configuration intact', () => {
    // The model picker and the agents read baseUrl, models and name, so stripping
    // must not take those with it.
    const result = providersFor([provider('openai', 'sk-secret')], false)
    expect(result[0].id).toBe('openai')
    expect(result[0].baseUrl).toBe('https://openai.example.com/v1')
    expect(result[0].models).toHaveLength(1)
    expect(result[0].enabled).toBe(true)
  })

  it('does not mutate the input', () => {
    const input = [provider('openai', 'sk-secret')]
    providersFor(input, false)
    expect(input[0].apiKey).toBe('sk-secret')
  })
})
