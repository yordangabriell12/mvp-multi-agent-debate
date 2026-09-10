import { describe, expect, it } from 'vitest'
import { EVIDENCE_RULES, QUALITY_RULES, WRITING_RULES } from './prompts'

describe('EVIDENCE_RULES', () => {
  it('forbids inventing numbers and sources', () => {
    expect(EVIDENCE_RULES).toMatch(/Never invent numbers/)
    expect(EVIDENCE_RULES).toMatch(/Do not cite anything you cannot point to/)
  })

  it('asks for inference and guesses to be labelled', () => {
    expect(EVIDENCE_RULES).toMatch(/Label inference/)
    expect(EVIDENCE_RULES).toMatch(/labelled guess/i)
  })

  it('asks for fact, estimate and opinion to be separated', () => {
    expect(EVIDENCE_RULES).toMatch(/fact/)
    expect(EVIDENCE_RULES).toMatch(/estimate/)
    expect(EVIDENCE_RULES).toMatch(/opinion/)
  })
})

describe('WRITING_RULES', () => {
  it('bans the em dash, matching the house rule', () => {
    expect(WRITING_RULES).toMatch(/Never use an em dash/)
  })

  // The rule text itself has to model the rule it states, so the block must not
  // be the exception that trips the R-02 check.
  it('does not itself contain an em dash', () => {
    expect(WRITING_RULES.includes('\u2014')).toBe(false)
    expect(EVIDENCE_RULES.includes('\u2014')).toBe(false)
    expect(QUALITY_RULES.includes('\u2014')).toBe(false)
  })

  it('bans the buzzword list', () => {
    for (const word of ['seamless', 'revolutionary', 'cutting edge', 'unlock', 'synergy']) {
      expect(WRITING_RULES).toContain(word)
    }
  })

  it('bans filler openers', () => {
    expect(WRITING_RULES).toMatch(/Great question/)
    expect(WRITING_RULES).toMatch(/Let me explain/)
  })
})

describe('QUALITY_RULES', () => {
  it('contains both blocks, so one call sites cannot include only half', () => {
    expect(QUALITY_RULES).toContain(EVIDENCE_RULES)
    expect(QUALITY_RULES).toContain(WRITING_RULES)
  })

  it('is safe to concatenate into a prompt', () => {
    expect(QUALITY_RULES.startsWith('\n')).toBe(true)
    expect(QUALITY_RULES.trim().length).toBeGreaterThan(200)
  })
})
