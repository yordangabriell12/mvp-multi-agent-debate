// The search endpoint used by Deep Search.
//
// A search is per agent, not per question: each agent asks for what its own role
// needs, which is the point of the feature. The agent supplies the query it
// decided on, and this route only performs the search and reports where the
// results came from.
//
// It does not decide whether searching is appropriate. That decision belongs to
// the caller, which knows the session setting, and keeping it out of here means
// turning the feature on or off cannot leave this route holding a stale view.

import { checkChatRateLimit } from '@/lib/rateLimit'
import { getCurrentUser } from '@/lib/session'
import { searchBackendsFromEnvironment, searchWeb } from '@/lib/webSearch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, private, max-age=0' }

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...NO_STORE },
  })
}

function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  )
}

export async function POST(req: Request) {
  const limit = checkChatRateLimit(clientIp(req))
  if (!limit.allowed) {
    return jsonResponse({ error: 'Too many requests. Please slow down.' }, 429)
  }

  const account = await getCurrentUser()
  if (!account) return jsonResponse({ error: 'Unauthorized' }, 401)

  let body: { query?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const query = String(body?.query ?? '').trim()
  if (!query) return jsonResponse({ error: 'A search query is required.' }, 400)
  if (query.length > 300) return jsonResponse({ error: 'That query is too long.' }, 400)

  const outcome = await searchWeb(query, searchBackendsFromEnvironment())

  return jsonResponse({
    query: outcome.query,
    results: outcome.hits.map((hit) => ({
      title: hit.title,
      snippet: hit.snippet,
      url: hit.url,
      source: hit.source,
    })),
    sources: outcome.sources,
    ...(outcome.warning ? { warning: outcome.warning } : {}),
  })
}
