import { describe, expect, it } from 'vitest'
import {
  UNLIMITED_ROUND_CEILING,
  extractAgentTags,
  findAgentsInMessage,
  parseDecision,
  resolveRoundCap,
  type RoomAgent,
} from './debate'

const ROOM: RoomAgent[] = [
  { id: 'agent-maya', name: 'Maya', roleTitle: 'VP of Sales' },
  { id: 'agent-aldo', name: 'Aldo', roleTitle: 'Finance Advisor' },
  { id: 'agent-sinta', name: 'Sinta', roleTitle: 'Legal Counsel' },
]

describe('resolveRoundCap', () => {
  // Regression: the cap used to be hard-clamped to 2, so the Max Rounds control
  // in the sidebar had no effect at any setting.
  it('honours the configured value instead of clamping to 2', () => {
    expect(resolveRoundCap(3)).toBe(3)
    expect(resolveRoundCap(5)).toBe(5)
    expect(resolveRoundCap(20)).toBe(20)
  })

  it('treats 1 as the opening round only', () => {
    expect(resolveRoundCap(1)).toBe(1)
  })

  it('never goes below one round', () => {
    expect(resolveRoundCap(0)).toBe(1)
    expect(resolveRoundCap(-4)).toBe(1)
  })

  it('caps unlimited so a forgotten session stops', () => {
    expect(resolveRoundCap('unlimited')).toBe(UNLIMITED_ROUND_CEILING)
  })

  it('falls back to one round for a non-finite value', () => {
    expect(resolveRoundCap(Number.NaN)).toBe(1)
    expect(resolveRoundCap(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('floors fractional values', () => {
    expect(resolveRoundCap(3.9)).toBe(3)
  })
})

describe('findAgentsInMessage', () => {
  it('matches a plain name', () => {
    expect(findAgentsInMessage('what does Maya think?', ROOM).map((a) => a.name)).toEqual(['Maya'])
  })

  it('matches an @mention', () => {
    expect(findAgentsInMessage('@Aldo please check the numbers', ROOM).map((a) => a.name)).toEqual(['Aldo'])
  })

  it('matches case-insensitively', () => {
    expect(findAgentsInMessage('SINTA what are the risks', ROOM).map((a) => a.name)).toEqual(['Sinta'])
  })

  it('returns every agent named', () => {
    const found = findAgentsInMessage('Maya and Aldo disagree', ROOM).map((a) => a.name)
    expect(found).toContain('Maya')
    expect(found).toContain('Aldo')
  })

  it('returns nothing when no name appears', () => {
    expect(findAgentsInMessage('what is the weather', ROOM)).toEqual([])
  })

  it('keeps the agent id so the caller can route', () => {
    expect(findAgentsInMessage('Maya', ROOM)[0].id).toBe('agent-maya')
  })
})

describe('extractAgentTags', () => {
  it('collects an @mention that matches a room agent', () => {
    expect(extractAgentTags('I agree with @Maya here', ROOM)).toEqual(['Maya'])
  })

  it('ignores mentions of unknown names', () => {
    expect(extractAgentTags('thanks @Nobody', ROOM)).toEqual([])
  })

  it('deduplicates repeated mentions', () => {
    expect(extractAgentTags('@Maya and again @Maya', ROOM)).toEqual(['Maya'])
  })

  it('returns an empty list when there is no mention', () => {
    expect(extractAgentTags('no mentions here', ROOM)).toEqual([])
  })

  it('is case-insensitive but returns the canonical name', () => {
    expect(extractAgentTags('cc @aldo', ROOM)).toEqual(['Aldo'])
  })
})

describe('parseDecision', () => {
  it('reads the primary JSON format', () => {
    const decision = parseDecision('{"action":"FOLLOWUP","agents":["Maya"],"question":"what is the impact?"}')
    expect(decision.action).toBe('followup')
    expect(decision.agents).toEqual(['Maya'])
    expect(decision.question).toBe('what is the impact?')
  })

  it('reads JSON wrapped in prose', () => {
    const decision = parseDecision('Thinking... {"action":"CHALLENGE","agents":["Aldo"],"question":"source?"} done')
    expect(decision.action).toBe('challenge')
    expect(decision.agents).toEqual(['Aldo'])
  })

  it('accepts a single agent given as an object key', () => {
    const decision = parseDecision('{"action":"FOLLOWUP","agent":"Sinta","question":"risk?"}')
    expect(decision.action).toBe('followup')
    expect(decision.agents).toEqual(['Sinta'])
  })

  it('returns summary when the action is summary', () => {
    expect(parseDecision('{"action":"summary"}').action).toBe('summary')
  })

  it('treats an unknown action as a follow-up rather than ending the debate', () => {
    expect(parseDecision('{"action":"compliment","agents":["Maya"]}').action).toBe('followup')
  })

  it('drops non-string entries from the agents list', () => {
    const decision = parseDecision('{"action":"FOLLOWUP","agents":["Maya",42,null],"question":"q"}')
    expect(decision.agents).toEqual(['Maya'])
  })

  it('falls back to the plain-text format', () => {
    const decision = parseDecision('ACTION: FOLLOWUP\nAGENT: Maya\nQUESTION: how so?')
    expect(decision.action).toBe('followup')
    expect(decision.agents).toEqual(['Maya'])
    expect(decision.question).toBe('how so?')
  })

  it('returns summary for the plain-text summary form', () => {
    expect(parseDecision('ACTION: SUMMARY').action).toBe('summary')
  })

  it('returns summary when the plain-text form is incomplete', () => {
    expect(parseDecision('ACTION: FOLLOWUP\nAGENT: Maya').action).toBe('summary')
  })

  it('returns summary for unparseable output so the loop cannot spin', () => {
    expect(parseDecision('').action).toBe('summary')
    expect(parseDecision('the moderator said something vague').action).toBe('summary')
  })

  it('survives malformed JSON without throwing', () => {
    expect(parseDecision('{"action":').action).toBe('summary')
    expect(parseDecision('{oops}').action).toBe('summary')
  })
})
