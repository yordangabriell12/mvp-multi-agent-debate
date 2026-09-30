/**
 * A stand-in for a chat provider, for testing the search planning stage.
 *
 * The behaviour that had to be verified end to end is that three agents in one room do not
 * pick the same keywords. That depends on what the planner sends in its prompt, which a unit
 * test can assert but cannot prove reaches the real route, and on the live behaviour of the
 * code that serialises the planners, which a unit test can only simulate. So this answers
 * chat completions like a provider would, and it separates the two kinds of call by their
 * system prompt.
 *
 * Two planner behaviours, chosen by VMA_MOCK_STUBBORN:
 *
 *   default (off)   Obeys the instruction: it reads the "already searched" list and answers
 *                   with angles that are not on it. This is what a working model does, and
 *                   it is the path that has to produce three different sets of keywords.
 *   VMA_MOCK_STUBBORN=1
 *                   Ignores the instruction and always answers with the same pair. This is
 *                   what a model that does not comply does, and it is how the code-enforced
 *                   fallback is exercised: the room must still not run the same query twice.
 *
 * Both are needed. The first proves the feature works; the second proves it does not depend
 * on the model behaving.
 *
 * Not shipped in the image. Only used from a test script.
 *
 * Usage: node scripts/mock-chat-provider.mjs [port]
 */

import { createServer } from 'node:http'
import { appendFileSync } from 'node:fs'

const port = Number(process.argv[2] || 4598)
const STUBBORN = process.env.VMA_MOCK_STUBBORN === '1'
/**
 * Where to record the prompts that arrive, for verifying what the model was actually told.
 *
 * Set by a test that needs to see the real prompt rather than assert on a string built in
 * isolation. It is how the date being present is checked end to end: the browser clock, the
 * hook and the planner all have to line up for the date to appear here.
 */
const PROMPT_LOG = process.env.VMA_MOCK_PROMPT_LOG || ''

/** The queries a lazy planner reaches for, whatever it is asked. */
const OBVIOUS_QUERIES = ['apa itu dewave', 'dewave indonesia']

/**
 * Angles a compliant planner falls back to, in order, when its usual ones are taken.
 *
 * Enough entries that three agents in one room each get their own pair, which is what makes
 * "the keywords differ" a real assertion rather than an accident of the list being long.
 */
const ALTERNATIVE_ANGLES = [
  'dewave fitur lengkap',
  'dewave harga langganan',
  'dewave kompetitor',
  'dewave ulasan pengguna',
  'dewave keamanan data',
  'dewave cara daftar',
]

/** Normalises for comparison the same way the app does: order does not matter. */
function keyOf(query) {
  return query.toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ')
}

/** Pulls the "already searched" lines out of the prompt, as a reading model would. */
function avoidListFrom(prompt) {
  const block = prompt.split('ALREADY SEARCHED BY OTHERS')[1] || ''
  return block
    .split('\n')
    .map((line) => line.trim().replace(/^-\s*/, ''))
    .filter((line) => line.length > 3 && !line.includes('ALREADY'))
    .map(keyOf)
}

/** Picks queries this agent has not been told about, in the same shape as the obvious pair. */
function compliantQueries(prompt) {
  const avoided = new Set(avoidListFrom(prompt))
  const chosen = []

  // Two per agent, matching what a real planner is asked for.
  for (const angle of ALTERNATIVE_ANGLES) {
    if (chosen.length >= 2) break
    const key = keyOf(angle)
    if (avoided.has(key)) continue
    avoided.add(key)
    chosen.push(angle)
  }

  return chosen
}

function sse(res, text) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  // Word by word, so the route's frame reader is exercised rather than handed one blob.
  const words = text.split(/(\s+)/)
  for (const word of words) {
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: word } }] }) + '\n\n')
  }
  res.write('data: [DONE]\n\n')
  res.end()
}

createServer((req, res) => {
  if (req.method === 'GET' && req.url?.startsWith('/v1/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'mock-chat' }] }))
    return
  }

  if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
    return
  }

  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    let parsed = {}
    try { parsed = JSON.parse(body) } catch { /* an unreadable body is answered as a planner */ }

    const system = String(parsed?.messages?.find((m) => m.role === 'system')?.content || '')
    const userPrompt = String(parsed?.messages?.find((m) => m.role === 'user')?.content || '')
    const isPlanner = /Reply with search queries only/i.test(system)

    // Recorded before answering, so the log shows what was asked even when the reply is a
    // fixed string.
    if (PROMPT_LOG) {
      try {
        appendFileSync(PROMPT_LOG, JSON.stringify({ kind: isPlanner ? 'planner' : 'agent', system, user: userPrompt }) + String.fromCharCode(10))
      } catch { /* a log that cannot be written must not break the reply */ }
    }

    if (isPlanner) {
      const queries = STUBBORN ? OBVIOUS_QUERIES : compliantQueries(userPrompt)
      sse(res, queries.join('\n') + '\n')
      return
    }

    // An agent answer. Kept short and distinctive so a transcript is readable.
    const name = String(parsed?.model || 'Agent')
    sse(res, 'Jawaban dari ' + name + ': ini pendapat saya tentang pertanyaan itu.')
  })
}).listen(port, '127.0.0.1', () => {
  console.log('mock chat provider on http://127.0.0.1:' + port + (STUBBORN ? ' (stubborn)' : ' (compliant)'))
})
