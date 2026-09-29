// Tests for the Deep Search client logic.
//
// The property that matters most here is the one the feature was asked for: the
// toggle is read at the moment of a turn, so switching it on and off repeatedly
// changes only the turns that follow. That is verified by driving the functions
// in alternating order rather than by inspecting any stored state, because the
// absence of stored state is the thing being asserted.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { proposeQueries, researchFor, readStream } from '@/lib/deepSearch'

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
