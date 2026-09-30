// Tests for keeping the agents' searches apart.
//
// The failure being pinned: three agents asked one question all look up the same thing, so
// the room pays for three searches and reads one result set three times. The checks below
// cover both halves, that a reordering is recognised as the same search, and that different
// angles are left alone rather than over-collapsed.

import { describe, it, expect } from 'vitest'
import { areSameQuery, distinctQueries, normaliseQuery, queryTokens } from '@/lib/queryDedupe'

describe('queryTokens', () => {
  it('lowercases and splits on punctuation', () => {
    expect(queryTokens('Tarif PPh Badan, 2024!')).toEqual(['tarif', 'pph', 'badan', '2024'])
  })

  it('drops words that carry no meaning on their own', () => {
    expect(queryTokens('apa itu dewave')).toEqual(['dewave'])
  })

  it('keeps repeated words, because a duplicate is not the same as a missing one', () => {
    expect(queryTokens('pajak pajak')).toEqual(['pajak', 'pajak'])
  })

  it('survives a query that is only punctuation', () => {
    expect(queryTokens('--- ???')).toEqual([])
  })
})

describe('normaliseQuery', () => {
  it('ignores word order', () => {
    expect(normaliseQuery('tarif PPh badan 2024')).toBe(normaliseQuery('PPh badan tarif 2024'))
  })

  it('is empty for a query with no meaningful words', () => {
    expect(normaliseQuery('apa itu yang')).toBe('')
  })
})

describe('areSameQuery', () => {
  it('treats a reordering as the same search', () => {
    expect(areSameQuery('tarif PPh badan 2024', '2024 tarif PPh badan')).toBe(true)
  })

  it('treats a subset as the same search', () => {
    // One qualifier does not make it a different angle.
    expect(areSameQuery('tarif PPh badan', 'tarif PPh badan 2024')).toBe(true)
  })

  it('keeps genuinely different angles apart', () => {
    expect(areSameQuery('tarif PPh badan 2024', 'sanksi telat lapor SPT')).toBe(false)
    expect(areSameQuery('apa itu dewave', 'dewave competitor pricing')).toBe(false)
  })

  it('does not collapse on a single shared word', () => {
    // "pajak" alone links hundreds of unrelated queries, so one token is not evidence.
    expect(areSameQuery('pajak', 'pajak daerah')).toBe(false)
  })

  it('never matches when one side has no meaningful words', () => {
    expect(areSameQuery('apa itu', 'apa itu')).toBe(false)
    expect(areSameQuery('', 'pajak')).toBe(false)
  })

  it('matches a reordered subset', () => {
    expect(areSameQuery('badan tarif', 'tarif badan pajak')).toBe(true)
  })
})

describe('distinctQueries', () => {
  it('keeps the first of a repeated pair and drops the rest', () => {
    expect(distinctQueries(['tarif PPh badan', 'badan tarif PPh'])).toEqual(['tarif PPh badan'])
  })

  it('drops what another agent already searched', () => {
    expect(distinctQueries(['tarif PPh badan'], ['tarif PPh badan 2024'])).toEqual([])
  })

  it('keeps a query that is a different angle', () => {
    expect(distinctQueries(['sanksi telat lapor'], ['tarif PPh badan'])).toEqual(['sanksi telat lapor'])
  })

  it('trims, and drops the blank entries a chatty planner emits', () => {
    expect(distinctQueries(['  tarif PPh  ', '', '   '])).toEqual(['tarif PPh'])
  })

  it('leaves a query of pure stopwords alone rather than dropping it', () => {
    // It cannot be compared to anything, so discarding it would silently lose a query the
    // model did propose.
    expect(distinctQueries(['apa itu'])).toEqual(['apa itu'])
  })

  it('handles the three-agent case that motivated this', () => {
    // Maya and Aldo both reach for the obvious phrasing; Sinta asks something else.
    const maya = ['apa itu dewave', 'dewave indonesia']
    const aldo = ['dewave indonesia', 'dewave harga']
    const first = distinctQueries(maya)
    const second = distinctQueries(aldo, first)

    expect(first).toEqual(['apa itu dewave', 'dewave indonesia'])
    // "dewave indonesia" overlaps with what Maya ran, so only the new angle survives.
    expect(second).toEqual(['dewave harga'])
  })
})
