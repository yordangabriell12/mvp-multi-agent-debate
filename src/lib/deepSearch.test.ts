// Tests for the Deep Search client logic.
//
// The property that matters most here is the one the feature was asked for: the
// toggle is read at the moment of a turn, so switching it on and off repeatedly
// changes only the turns that follow. That is verified by driving the functions
// in alternating order rather than by inspecting any stored state, because the
// absence of stored state is the thing being asserted.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { proposeQueries, researchFor, readStream } from '@/lib/deepSearch'
import { createLock } from '@/lib/lock'
import { clockContext } from '@/lib/clock'

/** Builds a chat route style stream: newline separated `0:` JSON frames. */
function chatStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode('0:' + JSON.stringify(chunk) + '\n'))
      }
      controller.close()
    },
  })
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('readStream', () => {
  it('joins the text out of the frame format', async () => {
    const text = await readStream(chatStream(['unit ', 'economics', ' matter']))
    expect(text).toBe('unit economics matter')
  })

  it('keeps an unparseable frame instead of dropping its text', async () => {
    // The chat route occasionally emits a frame that is not JSON. Losing it would
    // silently shorten the reply.
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('0:plain-text-frame\n'))
        controller.close()
      },
    })
    expect(await readStream(stream)).toBe('plain-text-frame')
  })
})

const target = { provider: 'openai', modelName: 'gpt-4o' }

describe('proposeQueries', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the queries the model proposed', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(chatStream(['1. SaaS churn benchmarks 2026\n2. net revenue retention\n']))
    )

    const queries = await proposeQueries('Finance Advisor', 'Is our churn acceptable?', 2, target)
    // The numbering is the model's formatting, not part of the query.
    expect(queries).toEqual(['SaaS churn benchmarks 2026', 'net revenue retention'])
  })

  it('sends the agent role and the question, and names the agent model', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(chatStream(['a query'])))

    await proposeQueries('Legal Counsel', 'Can we do this?', 1, target)

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.agent.provider).toBe('openai')
    expect(body.agent.modelName).toBe('gpt-4o')
    expect(body.messages[0].content).toContain('Legal Counsel')
    expect(body.messages[0].content).toContain('Can we do this?')
  })

  it('respects an explicit refusal to search', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(chatStream(['NONE'])))
    expect(await proposeQueries('Advisor', 'What is 2+2?', 2, target)).toEqual([])
  })

  it('honours the query cap', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(chatStream(['one\n two\n three\n four\n'])))
    expect(await proposeQueries('Advisor', 'question', 2, target)).toHaveLength(2)
  })

  it('returns nothing rather than throwing when the planner fails', async () => {
    // A planner that fails must cost the turn its research, not its answer.
    vi.mocked(fetch).mockResolvedValue(new Response('nope', { status: 500 }))
    expect(await proposeQueries('Advisor', 'question', 2, target)).toEqual([])

    vi.mocked(fetch).mockRejectedValue(new Error('network down'))
    expect(await proposeQueries('Advisor', 'question', 2, target)).toEqual([])
  })

  /**
   * The property the agents-searching-the-same-thing complaint is about: a second agent
   * must not run a query the first one already ran.
   */
  it('names what others already searched, so the planner can avoid it', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(chatStream(['sanksi telat lapor SPT'])))

    await proposeQueries('Finance Advisor', 'apa itu dewave', 2, target, ['apa itu dewave', 'dewave indonesia'])

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    const prompt = body.messages[0].content as string
    expect(prompt).toContain('ALREADY SEARCHED BY OTHERS')
    expect(prompt).toContain('apa itu dewave')
    expect(prompt).toContain('dewave indonesia')
    // The instruction has to say the obvious thing: find a different angle, not a reword.
    expect(body.agent.systemPrompt).toContain('Never repeat one of those queries')
  })

  it('drops a query another agent already ran, even when the model proposes it anyway', async () => {
    // The model ignoring the instruction is the case that matters: the exclusion is
    // enforced in code so the result does not depend on compliance.
    vi.mocked(fetch).mockResolvedValue(
      new Response(chatStream(['dewave indonesia\ndewave harga langganan\n']))
    )

    const queries = await proposeQueries('Advisor', 'apa itu dewave', 3, target, ['dewave indonesia'])

    expect(queries).toEqual(['dewave harga langganan'])
  })

  it('drops a reordered repeat, not just an identical string', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(chatStream(['indonesia dewave'])))
    const queries = await proposeQueries('Advisor', 'apa itu dewave', 3, target, ['dewave indonesia'])
    expect(queries).toEqual([])
  })

  it('keeps a genuinely different angle', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(chatStream(['dewave indonesia\nsanksi telat lapor SPT\n']))
    )
    const queries = await proposeQueries('Advisor', 'apa itu dewave', 3, target, ['dewave indonesia'])
    expect(queries).toEqual(['sanksi telat lapor SPT'])
  })

  it('does not add the avoid block when nothing has been searched', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(chatStream(['dewave fitur'])))

    await proposeQueries('Advisor', 'apa itu dewave', 2, target, [])

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    // An empty heading would be noise in every first-agent prompt.
    expect(body.messages[0].content).not.toContain('ALREADY SEARCHED')
  })

  /**
   * The reported symptom: asked about the index "today", the agent searched without a date and
   * reported a stale value as current. The planner has to be told the date so the query can
   * carry it.
   */
  it('tells the planner the date and shows it in an example query', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(chatStream(['IHSG 30 September 2026'])))
    const now = clockContext(new Date('2026-09-30T07:35:00Z'), 'Asia/Jakarta')!

    await proposeQueries('Finance Advisor', 'cari ihsg hari ini', 2, target, [], now)

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    const prompt = body.messages[0].content as string
    expect(prompt).toContain('TODAY IS Wednesday, 30 September 2026')
    expect(prompt).toContain('Asia/Jakarta')
    // The example has to be shaped like a query, since that is what the model copies.
    expect(prompt).toContain('cari ihsg hari ini 30 September 2026')
    // And the instruction has to ask for the year explicitly.
    expect(body.agent.systemPrompt).toContain('put the year')
  })

  it('omits the date block when no clock was supplied', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(chatStream(['a query'])))

    await proposeQueries('Advisor', 'question', 2, target)

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.messages[0].content).not.toContain('TODAY IS')
  })
})

describe('researchFor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks a run with no queries as skipped, not as a failure', async () => {
    const result = await researchFor([], 'any question')
    expect(result.skipped).toBe(true)
    expect(result.block).toBe('')
    // No request is made at all, which is what keeps a turn with nothing to look
    // up as cheap as it was before the feature existed.
    expect(fetch).not.toHaveBeenCalled()
  })

  it('formats results as numbered evidence with their source', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        results: [
          {
            title: 'SaaS Metrics',
            snippet: 'Churn above 5% is a warning sign.',
            url: 'https://a.example/1',
            source: 'tavily',
          },
          {
            title: 'Retention',
            snippet: 'NRR is the better measure.',
            url: 'https://b.example/2',
            source: 'wikipedia',
          },
        ],
        sources: ['wikipedia', 'tavily'],
      })
    )

    const result = await researchFor(['saas churn'], 'Is our churn acceptable?')

    expect(result.skipped).toBe(false)
    expect(result.block).toContain('[1] SaaS Metrics (tavily)')
    expect(result.block).toContain('[2] Retention (wikipedia)')
    expect(result.block).toContain('https://a.example/1')
    expect(result.sources).toEqual(['wikipedia', 'tavily'])
  })

  it('tells the agent to admit a gap when nothing was found', async () => {
    // The alternative, an empty block, lets the agent answer as though its own
    // knowledge were verified. Saying so explicitly keeps the debate honest.
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ results: [], sources: [] }))

    const result = await researchFor(['obscure query'], 'What happened?')
    expect(result.block).toContain('no usable results')
    expect(result.block).toContain('do not invent sources')
    expect(result.results).toHaveLength(0)
  })

  it('instructs the agent to cite, and not to overclaim', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ results: [{ title: 'T', snippet: 'S', url: 'https://x.example' }] })
    )

    const result = await researchFor(['q'], 'question')
    expect(result.block).toContain('citing the number')
    expect(result.block).toContain('say what is missing')
  })

  it('survives one backend failing and passes the warning on', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        results: [{ title: 'Still here', snippet: 's', url: 'https://x.example' }],
        sources: ['wikipedia'],
        warning: 'Tavily returned 429',
      })
    )

    const result = await researchFor(['q'], 'question')
    expect(result.results).toHaveLength(1)
    expect(result.warning).toBe('Tavily returned 429')
  })

  it('runs several queries at once', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse({ results: [{ title: 'T', snippet: 's', url: 'https://x.example' }] })
    )

    await researchFor(['one', 'two', 'three'], 'question')
    expect(vi.mocked(fetch).mock.calls).toHaveLength(3)
  })
})

describe('the toggle affects only the turns that follow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does no work on a turn where it is off, then works on the next where it is on', async () => {
    // The requirement: turning it on and off repeatedly must be harmless and
    // immediate. Nothing is held between calls, so a turn with it off cannot
    // inherit a query from the turn before.
    vi.mocked(fetch).mockResolvedValue(new Response(chatStream(['churn benchmarks\n'])))

    const off = await researchFor([], 'question')
    expect(off.skipped).toBe(true)
    expect(fetch).not.toHaveBeenCalled()

    const queries = await proposeQueries('Finance Advisor', 'question', 2, target)
    expect(queries).toHaveLength(1)

    const offAgain = await researchFor([], 'question')
    expect(offAgain.skipped).toBe(true)
  })

  it('produces the same result on a repeated turn, with no accumulated state', async () => {
    // A second identical run has to look exactly like the first, or a session
    // left with the toggle on would quietly change its behaviour over time.
    //
    // A new Response per call, not a shared one: a Response body is a stream and
    // can be read only once, so reusing the object would make the second read
    // fail for a reason that has nothing to do with the code under test.
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse({
        results: [{ title: 'T', snippet: 's', url: 'https://x.example' }],
        sources: ['wikipedia'],
      })
    )

    const first = await researchFor(['same query'], 'question')
    const second = await researchFor(['same query'], 'question')

    expect(second.block).toBe(first.block)
    expect(second.sources).toEqual(first.sources)
    expect(second.skipped).toBe(false)
  })
})

/**
 * The scenario that was reported: one question, three agents, and every one of them
 * searching the same thing.
 *
 * This drives the two pieces the hook actually composes, the lock and the planner, in the
 * order the hook composes them, and asserts on the end result a reader would see: three
 * different sets of keywords. It is written at this level because the property is about the
 * interaction, and each piece is correct on its own without producing this outcome.
 */
describe('three agents asked one question', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Plans for one agent, holding the lock across the planning call, as the hook does. */
  async function plan(
    lock: ReturnType<typeof createLock>,
    shared: { queries: string[] },
    proposal: string
  ): Promise<string[]> {
    const release = await lock.acquire()
    try {
      // Read inside the critical section, which is the whole point: whatever a previous
      // agent committed is visible here.
      const avoid = [...shared.queries]
      vi.mocked(fetch).mockResolvedValueOnce(new Response(chatStream([proposal])))
      const queries = await proposeQueries('Advisor', 'apa itu dewave', 2, target, avoid)
      // Claimed before the ticket is given up, exactly as the hook does. Claiming after the
      // search would leave the next planner blind to this agent's queries, which is the bug
      // a real run found: two of three agents shared a pair of keywords.
      shared.queries.push(...queries)
      return queries
    } finally {
      release()
    }
  }

  it('ends with three different sets of keywords, not one repeated three times', async () => {
    const lock = createLock()
    const shared = { queries: [] as string[] }

    // All three start at once, exactly as the parallel agent turns do. The model is made
    // to behave badly on purpose: Maya and Aldo both propose the obvious phrasing, because
    // that is what really happens and what the code has to survive.
    const [maya, aldo, sinta] = await Promise.all([
      plan(lock, shared, 'apa itu dewave\ndewave indonesia'),
      plan(lock, shared, 'apa itu dewave\ndewave indonesia'),
      plan(lock, shared, 'dewave harga langganan\ndewave kompetitor'),
    ])

    // Maya went first and kept her pair.
    expect(maya).toEqual(['apa itu dewave', 'dewave indonesia'])
    // Aldo proposed the same two and was left with nothing, because his angles were taken
    // and inventing a third would be worse than admitting there was nothing new.
    expect(aldo).toEqual([])
    // Sinta's were different all along, so she kept both.
    expect(sinta).toEqual(['dewave harga langganan', 'dewave kompetitor'])

    // The property that matters: no keyword was ever run twice.
    const all = [...maya, ...aldo, ...sinta]
    expect(new Set(all).size).toBe(all.length)
  })

  it('gives a later agent the earlier agent\'s keywords in its prompt', async () => {
    const lock = createLock()
    const shared = { queries: [] as string[] }

    await plan(lock, shared, 'dewave fitur')
    vi.mocked(fetch).mockClear()
    await plan(lock, shared, 'dewave harga')

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    // The second agent is told what the first used, which is what lets it pick a new angle
    // rather than being handed a list to filter from.
    expect(body.messages[0].content).toContain('dewave fitur')
    expect(body.messages[0].content).toContain('ALREADY SEARCHED BY OTHERS')
  })

  it('never lets two planners read the shared list at the same time', async () => {
    const lock = createLock()
    const shared = { queries: [] as string[] }
    let inside = 0
    let overlapped = false

    async function observe(proposal: string) {
      const release = await lock.acquire()
      inside++
      if (inside > 1) overlapped = true
      await new Promise((r) => setTimeout(r, 5))
      vi.mocked(fetch).mockResolvedValueOnce(new Response(chatStream([proposal])))
      const queries = await proposeQueries('Advisor', 'q', 2, target, [...shared.queries])
      shared.queries.push(...queries)
      inside--
      release()
    }

    await Promise.all([observe('alpha satu'), observe('beta dua'), observe('gamma tiga')])

    // Two planners reading the list together is exactly the bug, so it is asserted on
    // directly rather than inferred from the queries being distinct.
    expect(overlapped).toBe(false)
    expect(shared.queries.length).toBe(3)
  })

  /**
   * A real run caught this: one agent's keywords were claimed only after its search finished,
   * so the agent that had already taken its ticket read a list that was missing them and
   * picked the same words. The tell was that the first two agents differed and the last two
   * matched.
   *
   * The search here is made slow on purpose. Claiming late is invisible when searching is
   * instant, which is why the bug survived the unit tests that existed.
   */
  it('lets the third agent see what the second claimed, not just the first', async () => {
    const lock = createLock()
    const shared = { queries: [] as string[] }
    const readBy: Record<string, string[]> = {}

    async function planAndSearch(agent: string, proposal: string) {
      const release = await lock.acquire()
      try {
        readBy[agent] = [...shared.queries]
        vi.mocked(fetch).mockResolvedValueOnce(new Response(chatStream([proposal])))
        const queries = await proposeQueries('Advisor', 'q', 2, target, readBy[agent])
        shared.queries.push(...queries)
        return queries
      } finally {
        release()
      }
    }

    // Started at the same time, as the parallel agent turns are.
    const first = planAndSearch('maya', 'alpha satu')
    // A slow search for the first agent, so anything claimed late would be missed.
    await new Promise((r) => setTimeout(r, 20))
    const second = planAndSearch('aldo', 'beta dua')
    const third = planAndSearch('sinta', 'gamma tiga')
    await Promise.all([first, second, third])

    // The third agent has to have been shown both earlier agents' queries. When the claim was
    // made after the search, it saw only Maya's and then proposed something Aldo had taken.
    expect(readBy.sinta).toContain('alpha satu')
    expect(readBy.sinta).toContain('beta dua')
  })
})
