// Tests for the reasoning-model output budget.
//
// The regression worth pinning: a flat 4096 made every reasoning model answer with an
// empty string. The second case is the guard rail, that the GLM-only `thinking` flag
// is not sent to families that would reject it with a 400.

import { describe, it, expect } from 'vitest'
import {
  isReasoningModel,
  resolveMaxTokens,
  reasoningTuningFor,
  DEFAULT_MAX_TOKENS,
  REASONING_MAX_TOKENS,
} from '@/lib/reasoningBudget'

describe('isReasoningModel', () => {
  it('recognises the model families that think first', () => {
    expect(isReasoningModel('o1-mini')).toBe(true)
    expect(isReasoningModel('o3')).toBe(true)
    expect(isReasoningModel('deepseek-reasoner')).toBe(true)
    expect(isReasoningModel('zai-org/GLM-5.3')).toBe(true)
    expect(isReasoningModel('glm4')).toBe(true)
    expect(isReasoningModel('qwen3-thinking')).toBe(true)
  })

  it('leaves ordinary models alone', () => {
    expect(isReasoningModel('gpt-4o')).toBe(false)
    expect(isReasoningModel('claude-sonnet-4-6')).toBe(false)
    expect(isReasoningModel('deepseek-flash')).toBe(false)
    expect(isReasoningModel('llama-3.1-70b')).toBe(false)
    expect(isReasoningModel('')).toBe(false)
  })

  it('does not treat a name merely containing "o1" as a reasoning model', () => {
    // `gpt-4o1` is not a model, but a loose match would classify it as one.
    expect(isReasoningModel('gpt-4o1')).toBe(false)
  })
})

describe('resolveMaxTokens', () => {
  it('gives a reasoning model room to think and still answer', () => {
    expect(resolveMaxTokens('zai-org/GLM-5.3')).toBe(REASONING_MAX_TOKENS)
    expect(REASONING_MAX_TOKENS).toBeGreaterThan(DEFAULT_MAX_TOKENS)
  })

  it('keeps the original ceiling for everything else', () => {
    expect(resolveMaxTokens('gpt-4o')).toBe(DEFAULT_MAX_TOKENS)
    expect(resolveMaxTokens('deepseek-flash')).toBe(DEFAULT_MAX_TOKENS)
  })
})

describe('reasoningTuningFor', () => {
  it('switches thinking off for the GLM family, which was measured', () => {
    expect(reasoningTuningFor('zai-org/GLM-5.3')).toEqual({ thinking: { type: 'disabled' } })
    expect(reasoningTuningFor('glm-4.5')).toEqual({ thinking: { type: 'disabled' } })
  })

  it('sends nothing extra to families that would reject the flag', () => {
    // These are reasoning models, so they get the larger budget, but they must not
    // receive GLM's `thinking` parameter.
    expect(reasoningTuningFor('o3')).toEqual({})
    expect(reasoningTuningFor('deepseek-reasoner')).toEqual({})
    expect(reasoningTuningFor('gpt-4o')).toEqual({})
    expect(reasoningTuningFor('')).toEqual({})
  })
})
