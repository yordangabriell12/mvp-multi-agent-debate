import { afterEach, describe, expect, it } from 'vitest'
import {
  chatRateLimits,
  checkChatRateLimit,
  checkRateLimit,
  clearFailures,
  globalPressure,
  maxBodyBytes,
  recordFailure,
  recordGlobalFailure,
} from './rateLimit'

// Each test uses its own key because the limiter keeps state in module scope.
let keyCounter = 0
const freshKey = () => `test-key-${++keyCounter}`

afterEach(() => {
  delete process.env.VMA_CHAT_MAX_REQUESTS
  delete process.env.VMA_CHAT_WINDOW_SECONDS
  delete process.env.VMA_MAX_BODY_BYTES
})

describe('checkRateLimit', () => {
  it('allows a fresh key', () => {
    expect(checkRateLimit(freshKey()).allowed).toBe(true)
  })

  it('blocks after five recorded failures', () => {
    const key = freshKey()
    for (let i = 0; i < 5; i++) recordFailure(key)
    const result = checkRateLimit(key)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('still allows the fourth failure, so the fifth attempt can happen', () => {
    const key = freshKey()
    for (let i = 0; i < 4; i++) recordFailure(key)
    expect(checkRateLimit(key).allowed).toBe(true)
  })

  it('resets once the failures are cleared', () => {
    const key = freshKey()
    for (let i = 0; i < 6; i++) recordFailure(key)
    expect(checkRateLimit(key).allowed).toBe(false)
    clearFailures(key)
    expect(checkRateLimit(key).allowed).toBe(true)
  })

  it('does not let one key affect another', () => {
    const blocked = freshKey()
    for (let i = 0; i < 6; i++) recordFailure(blocked)
    expect(checkRateLimit(blocked).allowed).toBe(false)
    expect(checkRateLimit(freshKey()).allowed).toBe(true)
  })
})

describe('global backstop', () => {
  // This counter is process-wide on purpose: it is what stops an attacker who
  // spoofs a new X-Forwarded-For value on every request. Assertions here rely on
  // it never being reset, so they run in ascending order.
  it('starts without pressure', () => {
    expect(globalPressure().blocked).toBe(false)
  })

  it('adds a delay once failures pile up, then refuses', () => {
    for (let i = 0; i < 15; i++) recordGlobalFailure()
    const soft = globalPressure()
    expect(soft.blocked).toBe(false)
    expect(soft.extraDelayMs).toBeGreaterThan(0)

    for (let i = 0; i < 25; i++) recordGlobalFailure()
    const hard = globalPressure()
    expect(hard.blocked).toBe(true)
    expect(hard.retryAfterSeconds).toBeGreaterThan(0)
  })
})

describe('chat limits', () => {
  it('reads defaults when the environment is unset', () => {
    const limits = chatRateLimits()
    expect(limits.maxRequests).toBe(150)
    expect(limits.windowMs).toBe(5 * 60 * 1000)
  })

  it('honours environment overrides', () => {
    process.env.VMA_CHAT_MAX_REQUESTS = '3'
    process.env.VMA_CHAT_WINDOW_SECONDS = '60'
    const limits = chatRateLimits()
    expect(limits.maxRequests).toBe(3)
    expect(limits.windowMs).toBe(60_000)
  })

  it('ignores a nonsense override', () => {
    process.env.VMA_CHAT_MAX_REQUESTS = 'lots'
    expect(chatRateLimits().maxRequests).toBe(150)
  })

  it('allows requests up to the limit, then refuses with a retry hint', () => {
    process.env.VMA_CHAT_MAX_REQUESTS = '2'
    process.env.VMA_CHAT_WINDOW_SECONDS = '60'
    const key = freshKey()

    expect(checkChatRateLimit(key).allowed).toBe(true)
    expect(checkChatRateLimit(key).allowed).toBe(true)

    const blocked = checkChatRateLimit(key)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('does not let one client exhaust another client budget', () => {
    process.env.VMA_CHAT_MAX_REQUESTS = '1'
    process.env.VMA_CHAT_WINDOW_SECONDS = '60'
    const first = freshKey()
    expect(checkChatRateLimit(first).allowed).toBe(true)
    expect(checkChatRateLimit(first).allowed).toBe(false)
    expect(checkChatRateLimit(freshKey()).allowed).toBe(true)
  })
})

describe('maxBodyBytes', () => {
  it('defaults to one megabyte', () => {
    expect(maxBodyBytes()).toBe(1_000_000)
  })

  it('honours the override', () => {
    process.env.VMA_MAX_BODY_BYTES = '2048'
    expect(maxBodyBytes()).toBe(2048)
  })

  it('ignores a nonsense override', () => {
    process.env.VMA_MAX_BODY_BYTES = '-5'
    expect(maxBodyBytes()).toBe(1_000_000)
  })
})
