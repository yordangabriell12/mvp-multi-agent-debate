// Tests for routing a question to agents.
//
// The case worth pinning is the Indonesian one. The old routing compared English
// words against both sides, and an Indonesian question shares no word with a
// profile written in English, so it silently fell through to a single agent. That
// looked like a working room answering with one voice, which is why it went
// unnoticed: nothing errored, the answer was just narrower than it should be.

import { describe, it, expect } from 'vitest'
import { selectAgentsForQuestion, scoreAgentForQuestion, type RoutableAgent } from '@/lib/routing'

const MAYA: RoutableAgent = {
  id: 'maya',
  name: 'Maya',
  roleTitle: 'VP of Sales',
  systemPrompt: 'You argue from market position and revenue.',
}

const ALDO: RoutableAgent = {
  id: 'aldo',
  name: 'Aldo',
  roleTitle: 'Finance Advisor',
  systemPrompt: 'You focus on budget, cost, tax and risk.',
}

const SINTA: RoutableAgent = {
  id: 'sinta',
  name: 'Sinta',
  roleTitle: 'Legal Counsel',
  systemPrompt: 'You look at contract and compliance obligations.',
}

const ROOM = [MAYA, ALDO, SINTA]
const names = (agents: RoutableAgent[]) => agents.map((a) => a.name)

describe('an explicit mention', () => {
  it('sends the question to everyone for @all', () => {
    expect(names(selectAgentsForQuestion(ROOM, '@all apa pendapat kalian?'))).toEqual([
      'Maya', 'Aldo', 'Sinta',
    ])
  })

  it('sends it to exactly the people named', () => {
    expect(names(selectAgentsForQuestion(ROOM, '@Aldo berapa biayanya?'))).toEqual(['Aldo'])
  })

  it('falls back to routing when the name matches nobody', () => {
    // A typo used to select nobody and the room went quiet, which reads as broken.
    const picked = selectAgentsForQuestion(ROOM, '@Budi apa risiko pajaknya?')
    expect(picked.length).toBeGreaterThan(0)
  })
})

describe('routing an Indonesian question', () => {
  it('reaches the finance agent for an Indonesian money question', () => {
    const picked = selectAgentsForQuestion(ROOM, 'Berapa anggaran yang wajar untuk ini?')
    expect(names(picked)).toContain('Aldo')
  })

  it('reaches the legal agent for an Indonesian contract question', () => {
    const picked = selectAgentsForQuestion(ROOM, 'Apakah klausul kontrak ini aman?')
    expect(names(picked)).toContain('Sinta')
  })

  it('reaches the sales agent for an Indonesian pricing question', () => {
    const picked = selectAgentsForQuestion(ROOM, 'Bagaimana strategi harga untuk pelanggan baru?')
    expect(names(picked)).toContain('Maya')
  })

  it('still routes the same question in English', () => {
    expect(names(selectAgentsForQuestion(ROOM, 'What budget should we set?'))).toContain('Aldo')
    expect(names(selectAgentsForQuestion(ROOM, 'Is this contract clause safe?'))).toContain('Sinta')
  })

  it('spreads across domains when the question touches two', () => {
    // A budget question with a risk angle is genuinely two agents' business.
    const picked = selectAgentsForQuestion(ROOM, 'Apa risiko pajak dan dampaknya ke anggaran?')
    expect(picked.length).toBeGreaterThan(1)
  })
})

describe('scoring', () => {
  it('gives a point per shared domain', () => {
    expect(scoreAgentForQuestion(ALDO, 'berapa anggaran dan pajaknya?')).toBe(2)
  })

  it('gives nothing when no domain is shared', () => {
    expect(scoreAgentForQuestion(ALDO, 'apa warna langit sore ini?')).toBe(0)
  })
})

describe('an unrouted question', () => {
  it('goes to exactly one agent rather than all three', () => {
    // Three near-identical answers to a subjectless question cost three times as
    // much and tell the user nothing extra.
    expect(selectAgentsForQuestion(ROOM, 'apa warna langit sore ini?')).toHaveLength(1)
  })

  it('handles an empty room without throwing', () => {
    expect(selectAgentsForQuestion([], 'apa saja')).toEqual([])
  })
})
