// Tests for the date handed to the model.
//
// The bug being pinned is a wrong value reported as current: asked for "IHSG today", a model
// with no clock answers from its training data, so the date block is the only thing standing
// between the room and a confident answer about a year that has ended.
//
// The timezone case matters most. The server runs in UTC and the reader is in Jakarta, so the
// date has to come from where the person is, and the first seven hours of a Jakarta day are
// still the previous day in UTC.

import { describe, it, expect } from 'vitest'
import { clockContext, clockBlock, queryForSearch } from '@/lib/clock'

/** 2026-09-30T07:35:00Z: 30 September in Jakarta, still 30 September in UTC. */
const MORNING_JAKARTA = new Date('2026-09-30T07:35:00Z')
/** 2026-09-29T23:30:00Z: already 30 September in Jakarta, still 29 September in UTC. */
const LATE_NIGHT_UTC = new Date('2026-09-29T23:30:00Z')

describe('clockContext', () => {
  it('reads the date and time where the reader is', () => {
    const clock = clockContext(MORNING_JAKARTA, 'Asia/Jakarta')
    expect(clock).not.toBeNull()
    expect(clock!.date).toBe('Wednesday, 30 September 2026')
    expect(clock!.time).toBe('14:35')
    expect(clock!.timeZone).toBe('Asia/Jakarta')
    expect(clock!.offset).toBe('GMT+07:00')
  })

  /**
   * The case that makes a server clock unusable: at 06:30 in Jakarta it is still the previous
   * day in UTC, so "today" from the server would be a day behind for the reader.
   */
  it('gives the reader their day, not the server day', () => {
    const utc = clockContext(LATE_NIGHT_UTC, 'UTC')
    const jakarta = clockContext(LATE_NIGHT_UTC, 'Asia/Jakarta')

    expect(utc!.date).toBe('Tuesday, 29 September 2026')
    expect(jakarta!.date).toBe('Wednesday, 30 September 2026')
    // Same instant, two dates: this is exactly why the browser supplies the clock.
    expect(jakarta!.date).not.toBe(utc!.date)
  })

  it('falls back to the runtime zone when the zone name is not recognised', () => {
    // An unknown zone makes Intl throw, and a throw here would cost the whole turn.
    const clock = clockContext(MORNING_JAKARTA, 'Not/AZone')
    expect(clock).not.toBeNull()
    expect(clock!.date.length).toBeGreaterThan(0)
  })

  it('works with no zone given at all', () => {
    const clock = clockContext(MORNING_JAKARTA)
    expect(clock).not.toBeNull()
    expect(clock!.date).toContain('2026')
  })

  it('is fresh per call, so a tab left open does not keep yesterday', () => {
    const first = clockContext(new Date('2026-09-30T10:00:00Z'), 'Asia/Jakarta')
    const later = clockContext(new Date('2026-10-01T10:00:00Z'), 'Asia/Jakarta')
    expect(first!.date).toBe('Wednesday, 30 September 2026')
    expect(later!.date).toBe('Thursday, 1 October 2026')
  })
})

describe('clockBlock', () => {
  it('states the date as fact', () => {
    const block = clockBlock(clockContext(MORNING_JAKARTA, 'Asia/Jakarta'))
    expect(block).toContain('Today is Wednesday, 30 September 2026')
    expect(block).toContain('Asia/Jakarta, GMT+07:00')
  })

  it('says the training data is older, which is the actual failure', () => {
    const block = clockBlock(clockContext(MORNING_JAKARTA, 'Asia/Jakarta'))
    expect(block).toContain('training data is older')
  })

  /**
   * The reported symptom was a search, so the block has to change how the query is built and
   * not only how the answer reads.
   */
  it('tells the agent to put the date in the search query', () => {
    const block = clockBlock(clockContext(MORNING_JAKARTA, 'Asia/Jakarta'))
    expect(block).toContain('put the date in the query')
    expect(block).toContain('IHSG 30 September 2026')
  })

  it('forbids stating today\'s value from memory', () => {
    const block = clockBlock(clockContext(MORNING_JAKARTA, 'Asia/Jakarta'))
    expect(block).toContain('Never state a value for today from memory')
  })

  it('is empty when there is no clock, rather than saying something wrong', () => {
    expect(clockBlock(null)).toBe('')
  })

  it('reads the year for building a query', () => {
    expect(clockContext(MORNING_JAKARTA, 'Asia/Jakarta')!.year).toBe('2026')
    expect(clockContext(MORNING_JAKARTA, 'Asia/Jakarta')!.shortDate).toBe('30 September 2026')
  })

  it('does not use an em dash', () => {
    // The house rule applies to every string, including ones the model reads.
    expect(clockBlock(clockContext(MORNING_JAKARTA, 'Asia/Jakarta'))).not.toContain('\u2014')
  })
})

/**
 * The reported case: "cari ihsg hari ini" was sent to the search engine with no date, so the
 * engine decided for itself what "hari ini" meant and a stale index value came back looking
 * current.
 */
describe('queryForSearch', () => {
  const jakarta = () => clockContext(MORNING_JAKARTA, 'Asia/Jakarta')

  it('adds the year to a question that asks for the current value', () => {
    expect(queryForSearch('cari ihsg hari ini', jakarta())).toBe('cari ihsg hari ini 2026')
    expect(queryForSearch('IHSG today', jakarta())).toBe('IHSG today 2026')
    expect(queryForSearch('harga bitcoin sekarang', jakarta())).toBe('harga bitcoin sekarang 2026')
  })

  it('leaves a question that already carries a year alone', () => {
    // The user named a year deliberately, and rewriting it to this year would answer a
    // different question.
    expect(queryForSearch('ihsg 2024', jakarta())).toBe('ihsg 2024')
    expect(queryForSearch('laporan tahunan 2019 hari ini', jakarta())).toBe('laporan tahunan 2019 hari ini')
  })

  it('leaves a question that already names a month alone', () => {
    expect(queryForSearch('ihsg 30 September', jakarta())).toBe('ihsg 30 September')
    expect(queryForSearch('kinerja saham Agustus hari ini', jakarta())).toBe('kinerja saham Agustus hari ini')
  })

  it('leaves a question about something that does not change alone', () => {
    // A year here would narrow a definition search for no reason.
    expect(queryForSearch('apa itu dewave', jakarta())).toBe('apa itu dewave')
    expect(queryForSearch('cara menghitung PPh badan', jakarta())).toBe('cara menghitung PPh badan')
  })

  it('does not match a time word inside another word', () => {
    // "knowledge" contains "now"; a substring match would date a question that has nothing
    // to do with time.
    expect(queryForSearch('knowledge management system', jakarta())).toBe('knowledge management system')
    expect(queryForSearch('snowflake warehouse design', jakarta())).toBe('snowflake warehouse design')
  })

  it('returns the question unchanged when there is no clock', () => {
    expect(queryForSearch('cari ihsg hari ini', null)).toBe('cari ihsg hari ini')
  })

  it('handles an empty question', () => {
    expect(queryForSearch('', jakarta())).toBe('')
    expect(queryForSearch('   ', jakarta())).toBe('')
  })
})
