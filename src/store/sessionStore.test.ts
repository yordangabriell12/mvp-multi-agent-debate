// Tests for repairing sessions that were stored by an older build.
//
// The failure these guard against is quiet rather than loud. A session saved
// before `loopSpeed` and `settings` existed has no value for them, and the Mode
// screen reads both directly: the Speed control would render the literal word
// "undefined" instead of a speed, and no preset card would show as active, so the
// screen would read as "you have not chosen a mode". Neither is a crash on its own,
// which is exactly why a test is worth having: nothing else would report it.

import { describe, it, expect } from 'vitest'
import { normaliseStoredSessions } from '@/store/sessionStore'

/** A session in the shape an older build wrote: no settings, no presetMode. */
const LEGACY = JSON.stringify([
  {
    id: 'session-legacy1',
    name: 'Sesi Lama',
    agentIds: ['maya', 'aldo', 'sinta'],
    status: 'idle',
    currentRound: 0,
    responseMode: 'tag',
    createdAt: 1,
    updatedAt: 1,
  },
])

describe('sessions stored by an older build', () => {
  it('fills in settings that were never saved', () => {
    const [session] = normaliseStoredSessions(LEGACY)

    expect(session.settings.loopSpeed).toBe('normal')
    expect(session.settings.maxRounds).toBe(1)
    expect(session.settings.moderatorEnabled).toBe(false)
    expect(session.settings.deepSearch).toBe(false)
  })

  it('gives a session a valid preset so one card shows as active', () => {
    const [session] = normaliseStoredSessions(LEGACY)
    expect(session.presetMode).toBe('boardroom')
  })

  it('replaces a preset key that no longer exists', () => {
    // An older build may have stored a key that has since been renamed. Keeping it
    // would leave every card inactive, which reads as "not chosen" rather than
    // "that mode is gone".
    const stale = JSON.stringify([{ id: 's1', name: 'x', agentIds: [], presetMode: 'brainstorm' }])
    expect(normaliseStoredSessions(stale)[0].presetMode).toBe('boardroom')
  })

  it('leaves a valid preset alone', () => {
    const valid = JSON.stringify([{ id: 's1', name: 'x', agentIds: [], presetMode: 'war' }])
    expect(normaliseStoredSessions(valid)[0].presetMode).toBe('war')
  })

  it('keeps settings that were already saved', () => {
    const stored = JSON.stringify([
      {
        id: 's1',
        name: 'x',
        agentIds: [],
        presetMode: 'learning',
        settings: { loopSpeed: 'fast', maxRounds: 5, moderatorEnabled: true, deepSearch: true },
      },
    ])
    const [session] = normaliseStoredSessions(stored)

    expect(session.presetMode).toBe('learning')
    expect(session.settings.loopSpeed).toBe('fast')
    expect(session.settings.maxRounds).toBe(5)
    expect(session.settings.moderatorEnabled).toBe(true)
    expect(session.settings.deepSearch).toBe(true)
  })

  it('returns nothing rather than throwing on unreadable storage', () => {
    expect(normaliseStoredSessions('{ not json')).toEqual([])
    expect(normaliseStoredSessions(null)).toEqual([])
    // Valid JSON of the wrong shape is the other way this can arrive.
    expect(normaliseStoredSessions('{"sessions":[]}')).toEqual([])
  })
})
