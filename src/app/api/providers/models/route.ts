import { checkOutboundUrlDeep } from '@/lib/netGuard'
import { resolveProvider } from '@/lib/providerResolver'
import { getCurrentUser, requireAdmin } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lists the models a provider offers, so the user does not have to type ids by
// hand. This has to run server-side: the browser cannot call the provider
// directly, because most providers do not send CORS headers for /models.
//
// Two ways to call it, and the difference matters:
//
//   { id }                       Use the key already stored for this provider.
//                                Open to any signed-in account, because the
//                                caller only needs model ids, never the key.
//   { id, baseUrl, apiKey }      Test a key that has not been saved yet, which
//                                only happens while an admin edits a provider.
//                                Admin-only, or it would be a way for any
//                                account to make the server fetch a URL of its
//                                choosing.

const MAX_MODELS = 500

interface ProviderProbe {
  baseUrl?: string
  apiKey?: string
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

function providerHeaders(id: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (id === 'anthropic') {
    // Anthropic uses its own header, and the key is not optional here.
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

async function fetchModels(
  id: string,
  baseUrl: string,
  apiKey: string
): Promise<Response> {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/models`

  try {
    const response = await fetch(endpoint, {
      headers: providerHeaders(id, apiKey),
      signal: AbortSignal.timeout(20000),
    })
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

    // OpenAI-style: { data: [{ id }] }. Anthropic-style: the same shape.
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

export async function POST(req: Request) {
  let body: ProviderProbe
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const id = String(body?.id ?? '').trim()
  const suppliedKey = String(body?.apiKey ?? '').trim()

  if (suppliedKey) {
    // An unsaved key is being tested, which is an admin editing providers.
    const check = await requireAdmin()
    if (check.error) {
      return jsonResponse({ error: check.error }, check.status ?? 401)
    }

    const baseUrl = String(body?.baseUrl ?? '').trim()
    if (!baseUrl) return jsonResponse({ error: 'Base URL is required' }, 400)

    // The deep check matters here: an admin testing an unsaved key supplies the
    // base URL themselves, so this is the one path where the value in flight is
    // attacker-controlled again.
    const guard = await checkOutboundUrlDeep(baseUrl)
    if (!guard.ok) return jsonResponse({ error: guard.reason }, 400)

    return fetchModels(id, baseUrl, suppliedKey)
  }

  if (!id) return jsonResponse({ error: 'A provider id is required' }, 400)

  // Stored key path: the source is this account's own configuration.
  const account = await getCurrentUser()
  if (!account) return jsonResponse({ error: 'Unauthorized' }, 401)

  const resolved = await resolveProvider(account.id, id)
  if (!resolved.ok) {
    // An unset key is reported as an empty list rather than an error, so a
    // provider nobody has filled in yet produces no models instead of a
    // failure the UI has to explain away.
    if (resolved.status === 400 && /No API key/.test(resolved.error)) {
      return jsonResponse({ models: [], warning: resolved.error })
    }
    return jsonResponse({ error: resolved.error }, resolved.status)
  }

  return fetchModels(id, resolved.provider.baseUrl, resolved.provider.apiKey)
}

