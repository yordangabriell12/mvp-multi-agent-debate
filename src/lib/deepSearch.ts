// The client half of Deep Search.
//
// Two things happen per agent turn, in this order:
//
//   1. The agent proposes its own search queries. It is asked in its own voice,
//      with its own role and the question, so a finance agent looks for unit
//      economics while a legal agent looks for the regulation. That is the whole
//      point: one shared search would hand every agent the same answer.
//   2. The queries are run, and the results are returned as a block of text the
//      agent then sees in its context.
//
// The toggle is read by the caller at the moment of the turn and passed in. This
// module keeps no state of its own, so switching Deep Search on or off partway
// through a conversation changes the next turn and nothing else. Turning it off
// does not remove anything already gathered: those results live in the
// conversation as ordinary messages.

export interface ResearchResult {
  /** The queries that were run, in order. */
  queries: string[]
  /** A formatted block for the agent's context, empty when nothing was found. */
  block: string
  /** The results, for showing in the conversation. */
  results: { title: string; snippet: string; url: string; source?: string }[]
  sources: string[]
  /** Anything worth telling the user: a failed backend, a cap that was reached. */
  warning?: string
  /** True when no query was judged worth running. */
  skipped: boolean
}

const NL = String.fromCharCode(10)
const DNL = NL + NL

/**
 * Reads the `0:`-framed stream the chat route produces into plain text.
 *
 * The frames are that route's wire format, so this has to match it rather than
 * the other way around. A frame that will not parse is appended verbatim, which
 * is what the chat hook itself does.
 */
export async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(NL)
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('0:')) continue
      const raw = line.slice(2)
      try {
        const parsed = JSON.parse(raw)
        text += typeof parsed === 'string' ? parsed : String(parsed)
      } catch {
        text += raw
      }
    }
  }

  return text
}

export interface PlannerTarget {
  provider: string
  modelName: string
}

/**
 * Asks the model for search queries, given the agent's role and the question.
 *
 * One small call with a low token ceiling: a planning step, not an answer. The
 * model is the one the agent already uses, so this needs no extra configuration.
 *
 * A chatty reply is tolerated rather than fatal: lines are stripped of numbering
 * and bullets, and anything still prose-like is dropped by the length bound. The
 * worst case is a poor query, not a broken turn.
 */
export async function proposeQueries(
  role: string,
  question: string,
  maxQueries: number,
  target: PlannerTarget
): Promise<string[]> {
  const instruction = [
    'You decide what to look up before answering a question.',
    'Reply with search queries only, one per line, no numbering, no commentary.',
    `At most ${maxQueries} queries.`,
    'Write each one the way someone would type it into a search engine: short and specific.',
    'Use the language the question is written in.',
    'If looking something up would not help, reply with exactly: NONE',
  ].join(' ')

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: 'YOUR ROLE: ' + role + DNL + 'QUESTION: ' + question.slice(0, 1200),
          },
        ],
        agent: {
          id: 'deep-search-planner',
          name: 'Researcher',
          systemPrompt: instruction,
          provider: target.provider,
          modelName: target.modelName,
          temperature: 0.2,
        },
      }),
    })

    if (!res.ok || !res.body) return []

    const lines = (await readStream(res.body))
      .split(NL)
      .map((line) => line.replace(/^[\s\d.\-•*]+/, '').trim())
      .filter((line) => line.length > 3 && line.length < 200)

    if (lines.length === 0) return []
    // An explicit refusal is respected. Searching anyway on a question the model
    // judged to be general knowledge would spend a call and add nothing.
    if (lines.some((line) => /^NONE\b/i.test(line))) return []

    return lines.slice(0, maxQueries)
  } catch {
    // A planner that fails means no research, not a broken turn.
    return []
  }
}

/** Runs one query and returns what came back. Never throws. */
async function runQuery(
  query: string
): Promise<{ results: ResearchResult['results']; sources: string[]; warning?: string }> {
  try {
    const res = await fetch('/api/deep-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) return { results: [], sources: [] }

    const data = await res.json()
    return {
      results: Array.isArray(data?.results) ? data.results : [],
      sources: Array.isArray(data?.sources) ? data.sources : [],
      warning: typeof data?.warning === 'string' ? data.warning : undefined,
    }
  } catch {
    return { results: [], sources: [] }
  }
}

/**
 * Runs the queries an agent proposed and formats the outcome.
 *
 * The block is written as evidence, not as instruction: it names where each claim
 * came from and tells the agent to admit when the results do not cover the
 * question. Research presented as settled fact is how a debate ends up
 * confidently wrong, which is worse than not having searched at all.
 */
export async function researchFor(queries: string[], question: string): Promise<ResearchResult> {
  if (queries.length === 0) {
    return { queries: [], block: '', results: [], sources: [], skipped: true }
  }

  const outcomes = await Promise.all(queries.map((query) => runQuery(query)))

  const results: ResearchResult['results'] = []
  const sources = new Set<string>()
  const warnings: string[] = []

  for (const outcome of outcomes) {
    for (const result of outcome.results) results.push(result)
    for (const source of outcome.sources) sources.add(source)
    if (outcome.warning) warnings.push(outcome.warning)
  }

  const warning = warnings.length > 0 ? { warning: warnings.join('; ') } : {}

  if (results.length === 0) {
    return {
      queries,
      block:
        DNL +
        'RESEARCH ATTEMPTED for "' +
        question.slice(0, 120) +
        '": no usable results came back.' +
        NL +
        'Say plainly that you could not verify this, and do not invent sources.' +
        NL,
      results: [],
      sources: [],
      skipped: false,
      ...warning,
    }
  }

  const lines = results.slice(0, 8).map(
    (result, index) =>
      '[' +
      (index + 1) +
      '] ' +
      result.title +
      (result.source ? ' (' + result.source + ')' : '') +
      NL +
      '    ' +
      result.snippet +
      NL +
      '    ' +
      result.url
  )

  return {
    queries,
    block:
      DNL +
      'RESEARCH RESULTS (gathered for this question):' +
      NL +
      lines.join(NL) +
      DNL +
      'Use these as evidence, citing the number, for example [2].' +
      NL +
      'If they do not cover the question, say what is missing rather than filling the gap yourself.' +
      NL +
      'Do not treat these as settled: name where each claim comes from.' +
      NL,
    results,
    sources: [...sources],
    skipped: false,
    ...warning,
  }
}
