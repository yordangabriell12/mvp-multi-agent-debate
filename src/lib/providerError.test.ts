import { describe, expect, it } from 'vitest'
import { extractProviderError } from './providerError'

// Captured verbatim from 9router when the upstream OpenAI account was out of
// credits. This is the case that showed up in the app as a bare "Failed".
const NINE_ROUTER_QUOTA = `{"error":{"message":"[openai/gpt-4o] [429]: {
    \\"error\\": {
        \\"message\\": \\"You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.\\",
        \\"type\\": \\"insufficient_quota\\",
        \\"param\\": null,
        \\"code\\": \\"credit_balance_exhausted\\"
    }
} (reset after 2s)"}}`

describe('extractProviderError', () => {
  it('digs out the innermost message from a nested provider error', () => {
    const result = extractProviderError(NINE_ROUTER_QUOTA)
    expect(result).toContain('You have no credits remaining')
    // The routing wrapper is noise once the real reason is known.
    expect(result).not.toContain('insufficient_quota')
  })

  it('collapses the newlines that make the raw body unreadable', () => {
    expect(extractProviderError(NINE_ROUTER_QUOTA)).not.toContain('\n')
  })

  it('reads the common OpenAI shape', () => {
    const body = '{"error":{"message":"Incorrect API key provided","type":"invalid_request_error"}}'
    expect(extractProviderError(body)).toBe('Incorrect API key provided')
  })

  it('reads the common Anthropic shape', () => {
    const body = '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'
    expect(extractProviderError(body)).toBe('invalid x-api-key')
  })

  it('reads a plain top level message', () => {
    expect(extractProviderError('{"message":"model not found"}')).toBe('model not found')
  })

  it('handles a bare string error field', () => {
    expect(extractProviderError('{"error":"rate limited"}')).toBe('rate limited')
  })

  it('passes through a non-JSON body', () => {
    expect(extractProviderError('502 Bad Gateway')).toBe('502 Bad Gateway')
  })

  it('never returns an empty string', () => {
    expect(extractProviderError('')).toBe('The provider returned an empty error.')
    expect(extractProviderError('   ')).toBe('The provider returned an empty error.')
    expect(extractProviderError('{}')).toBe('{}')
  })

  it('truncates a very long message rather than flooding the chat', () => {
    const long = '{"error":{"message":"' + 'x'.repeat(1000) + '"}}'
    const result = extractProviderError(long)
    expect(result.length).toBeLessThanOrEqual(403)
    expect(result.endsWith('...')).toBe(true)
  })

  it('stops unwrapping instead of looping forever on self-referential text', () => {
    // A message identical to the whole body would otherwise recurse.
    const body = '{"error":{"message":"{\\"error\\":{\\"message\\":\\"same\\"}}"}}'
    expect(() => extractProviderError(body)).not.toThrow()
  })
})
