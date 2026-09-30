// What day it is, for putting in a prompt.
//
// A model has no clock. Asked to "search IHSG today", it treats "today" as whatever date
// happened to be in its training data, so it hunts for an index value from a year that has
// already ended and reports it as current. Nothing about the request looks wrong, which is
// what makes it hard to notice: the answer is specific, confident and out of date.
//
// So the date is stated in the prompt. Three decisions are worth recording because each one
// is a way this goes wrong:
//
//   The browser supplies it, not the server. The container runs in UTC; a person in Jakarta
//   asking at 08:00 local time is on the previous day in UTC, so a server clock would name
//   the wrong date for the first seven hours of every day.
//
//   It is read fresh per turn rather than once per session. A tab left open overnight would
//   otherwise still say yesterday.
//
//   It is a fact in the prompt, not an instruction to guess. The block states the date and
//   then says what to do with it, including that the model's own knowledge is probably older.

export interface ClockContext {
  /** Weekday and date where the reader is, for example "Wednesday, 30 September 2026". */
  date: string
  /** The date without the weekday, for building a search query: "30 September 2026". */
  shortDate: string
  /** Their local time, 24 hour, for example "14:35". */
  time: string
  /** Their zone, for example "Asia/Jakarta". */
  timeZone: string
  /** The offset from UTC, for example "GMT+07:00". Empty when it cannot be read. */
  offset: string
  /** Four digit year where the reader is, for example "2026". */
  year: string
}

/**
 * Reads the date, time and zone for a moment, as seen in a particular zone.
 *
 * Returns null rather than throwing when the date cannot be formatted at all. A prompt with
 * no clock is worse than one with a clock, but it is much better than a turn that fails.
 */
export function clockContext(now: Date, timeZone?: string): ClockContext | null {
  // An unknown zone name makes every formatter below throw, so it is checked once here and
  // dropped in favour of the runtime's own zone.
  const zone = timeZone && isValidZone(timeZone) ? timeZone : undefined

  try {
    const date = new Intl.DateTimeFormat('en-GB', {
      ...(zone ? { timeZone: zone } : {}),
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now)

    const time = new Intl.DateTimeFormat('en-GB', {
      ...(zone ? { timeZone: zone } : {}),
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now)

    const shortDate = new Intl.DateTimeFormat('en-GB', {
      ...(zone ? { timeZone: zone } : {}),
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now)

    const year = new Intl.DateTimeFormat('en-GB', {
      ...(zone ? { timeZone: zone } : {}),
      year: 'numeric',
    }).format(now)

    return {
      date,
      shortDate,
      year,
      time,
      timeZone: zone || resolvedZone() || 'local time',
      offset: offsetLabel(now, zone),
    }
  } catch {
    return null
  }
}

/** The reader's own clock, which is the one they mean by "today". */
export function browserClock(now: Date = new Date()): ClockContext | null {
  return clockContext(now)
}

/**
 * The query to actually send, with the year added when the question asks for something
 * current but names no date.
 *
 * The plain web-search path sends the user's words as the query, so "cari ihsg hari ini"
 * reaches the search engine as exactly that. The engine then decides for itself what "hari
 * ini" means, and an index value is a number that changes every day, so a result from the
 * wrong day looks exactly like a result from the right one.
 *
 * The year is appended only when the question is time-sensitive and does not already carry a
 * date. Adding it unconditionally would damage a search for something that does not move:
 * "apa itu dewave 2026" is a worse query than "apa itu dewave".
 */
export function queryForSearch(question: string, now: ClockContext | null): string {
  const trimmed = question.trim()
  if (!trimmed || !now) return trimmed

  // Already dated, in either the full or the short form. A year on its own counts, so a
  // question that says "2025" keeps it and is not rewritten to this year.
  if (/\b(19|20)\d{2}\b/.test(trimmed)) return trimmed
  if (namesAMonth(trimmed)) return trimmed
  if (!asksForNow(trimmed)) return trimmed

  return trimmed + ' ' + now.year
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'januari', 'februari', 'maret', 'mei', 'juni', 'juli',
  'agustus', 'oktober', 'november', 'desember',
]

function namesAMonth(text: string): boolean {
  const lower = text.toLowerCase()
  return MONTHS.some((month) => new RegExp('\\b' + month + '\\b').test(lower))
}

/**
 * Words that mean "the state of something right now".
 *
 * Kept as an explicit list rather than a broad pattern. Matching too much would append a year
 * to questions that have nothing to do with time, and a wrong extra word in a query is a
 * silent change to what the user asked for.
 */
const NOW_WORDS = [
  // Indonesian
  'hari ini', 'harini', 'saat ini', 'sekarang', 'terkini', 'terbaru', 'terupdate',
  'minggu ini', 'bulan ini', 'tahun ini', 'kemarin', 'besok', 'pagi ini', 'siang ini',
  'sore ini', 'malam ini', 'tadi',
  // English
  'today', 'now', 'currently', 'current', 'latest', 'this week', 'this month',
  'this year', 'yesterday', 'tomorrow', 'tonight', 'right now', 'at the moment',
]

function asksForNow(text: string): boolean {
  const lower = ' ' + text.toLowerCase() + ' '
  return NOW_WORDS.some((word) => lower.includes(' ' + word + ' ') || lower.includes(' ' + word + ','))
}

/**
 * The block to append to a prompt.
 *
 * Written as fact first and instruction second, and it names the failure directly, because a
 * bare date is easy for a model to read past. Says what to do for a search too, since a
 * query built from the wrong year returns the wrong pages no matter how good the agent is.
 */
export function clockBlock(clock: ClockContext | null): string {
  if (!clock) return ''

  const NL = String.fromCharCode(10)
  const zone = clock.offset ? clock.timeZone + ', ' + clock.offset : clock.timeZone

  return [
    'CURRENT DATE AND TIME:',
    '- Today is ' + clock.date + '.',
    '- The reader local time is ' + clock.time + ' (' + zone + ').',
    '- Your training data is older than this date. Treat it as out of date for anything that',
    '  changes: prices, market indices, exchange rates, interest rates, regulations, product',
    '  releases and news.',
    '- "Today", "yesterday", "this week" and "this month" mean the date above, not the date you',
    '  were trained on.',
    '- When searching, put the date in the query: "IHSG 30 September 2026" finds this year,',
    '  where "IHSG today" does not.',
    '- Never state a value for today from memory. Use what the search returned, or say that you',
    '  need a source.',
    NL,
  ].join(NL)
}

function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

function resolvedZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

/** "GMT+07:00", or empty when the runtime does not support reading it. */
function offsetLabel(now: Date, zone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      ...(zone ? { timeZone: zone } : {}),
      timeZoneName: 'longOffset',
    }).formatToParts(now)
    return parts.find((part) => part.type === 'timeZoneName')?.value || ''
  } catch {
    return ''
  }
}
