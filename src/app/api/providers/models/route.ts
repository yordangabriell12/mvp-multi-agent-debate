import { checkOutboundUrl } from '@/lib/netGuard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lists the models a provider offers, so the user does not have to type ids by
// hand. This has to run server-side: the browser cannot call the provider
// directly, because most providers do not send CORS headers for /models.

const MAX_MODELS = 500

interface ProviderProbe {
  baseUrl: string
  apiKey: string
  id?: string
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, private, max-age=0',
    },
  })
}

export async function POST(req: Request) {
  let body: ProviderProbe
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const baseUrl = String(body?.baseUrl ?? '').trim()
  const apiKey = String(body?.apiKey ?? '').trim()
  if (!baseUrl) return jsonResponse({ error: 'Base URL is required' }, 400)

  // Same guard as everywhere else: the base URL comes from the request body, so
  // it must not be usable to reach loopback or private addresses.
  if (process.env.VMA_ALLOW_PRIVATE_BASEURL !== 'true') {
    const guard = checkOutboundUrl(baseUrl)
    if (!guard.ok) return jsonResponse({ error: guard.reason }, 400)
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/models`
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  // Anthropic uses its own header, and its key is not optional here.
  if (body?.id === 'anthropic') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  }

  try {
    const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(20000) })
    const raw = await response.text()

    if (!response.ok) {
      return jsonResponse(
        { error: `Provider returned ${response.status}. ${raw.trim().slice(0, 200)}` },
        response.status
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return jsonResponse({ error: 'Provider did not return JSON' }, 502)
    }

    // OpenAI-style: { data: [{ id }] }. Anthropic-style: { data: [{ id }] } too.
    const list = (parsed as { data?: unknown })?.data
    if (!Array.isArray(list)) {
      return jsonResponse({ error: 'Provider response had no model list' }, 502)
    }

    const ids = list
      .map((entry) => {
        if (typeof entry === 'string') return entry
        const id = (entry as { id?: unknown })?.id
        return typeof id === 'string' ? id : null
      })
      .filter((id): id is string => Boolean(id && id.trim()))
      .slice(0, MAX_MODELS)

    return jsonResponse({ models: [...new Set(ids)] })
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError'
    return jsonResponse(
      {
        error: timeout
          ? 'Provider did not respond within 20 seconds.'
          : `Could not reach the provider: ${error instanceof Error ? error.message : 'unknown'}`,
      },
      502
    )
  }
}
