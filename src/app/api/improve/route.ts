import type { ProviderConfig } from '@/types/provider'
import { checkOutboundUrl } from '@/lib/netGuard'
import { checkChatRateLimit, maxBodyBytes } from '@/lib/rateLimit'
import { EVIDENCE_RULES, WRITING_RULES } from '@/lib/prompts'

export const runtime = 'nodejs'

interface ImproveRequest {
  text: string
  /** 'chat' rewrites a message to the agents, 'persona' rewrites a system prompt. */
  mode?: 'chat' | 'persona'
  provider: string
  modelName: string
  providers: ProviderConfig[]
}

function jsonResponse(payload: unknown, status = 200, extra?: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}

const CHAT_INSTRUCTION = [
  'You rewrite a user message so it gets better answers from a panel of AI advisors.',
  'Make it clearer, more specific and better structured. Add the context a reader would need.',
  'Keep the original intent and every factual detail the user supplied.',
  'Do not invent facts, numbers, names or constraints that were not there.',
  'Keep the user\'s language: Indonesian stays Indonesian, English stays English.',
  'Return only the rewritten message. No preamble, no explanation, no quotes around it.',
  'If the message is already good, return it with only small fixes.',
].join(' ')

const PERSONA_INSTRUCTION = [
  'You rewrite a system prompt that defines an AI agent\'s persona and behaviour.',
  'Make it clearer, more specific and more useful: sharpen the role, the tone, what the agent should and should not do.',
  'Keep the agent\'s identity, role and intent exactly as given.',
  'Do not add new expertise, new facts or new responsibilities that were not implied.',
  'Keep the original language.',
  'Write it as instructions addressed to the agent ("You are...").',
  'Return only the rewritten prompt. No preamble, no explanation, no quotes around it.',
].join(' ')

export async function POST(req: Request) {
  const ip =
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'

  const limit = checkChatRateLimit(ip)
  if (!limit.allowed) {
    return jsonResponse({ error: 'Too many requests. Please slow down.' }, 429, {
      'Retry-After': String(limit.retryAfterSeconds),
    })
  }

  const raw = await req.text()
  const cap = maxBodyBytes()
  if (raw.length > cap) return jsonResponse({ error: 'Request body too large' }, 413)

  let body: ImproveRequest
  try {
    body = JSON.parse(raw)
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const text = String(body?.text ?? '').trim()
  if (!text) return jsonResponse({ error: 'Nothing to improve' }, 400)
  if (text.length > 20000) return jsonResponse({ error: 'Text is too long to improve' }, 400)

  const providers = Array.isArray(body?.providers) ? body.providers : []
  const providerConfig = providers.find((p) => p.id === body?.provider)
  if (!providerConfig?.apiKey) {
    return jsonResponse({ error: 'No API key configured for this provider' }, 400)
  }

  if (process.env.VMA_ALLOW_PRIVATE_BASEURL !== 'true') {
    const guard = checkOutboundUrl(providerConfig.baseUrl)
    if (!guard.ok) return jsonResponse({ error: guard.reason }, 400)
  }

  const mode = body.mode === 'persona' ? 'persona' : 'chat'
  const instruction = mode === 'persona' ? PERSONA_INSTRUCTION : CHAT_INSTRUCTION

  const system = [
    instruction,
    '',
    'Rules you must follow while rewriting:',
    EVIDENCE_RULES,
    '',
    WRITING_RULES,
  ].join(String.fromCharCode(10))

  const baseUrl = providerConfig.baseUrl.replace(/\/$/, '')
  const isAnthropic = providerConfig.id === 'anthropic'

  try {
    let payload: Record<string, unknown>
    let headers: Record<string, string>
    let endpoint: string

    if (isAnthropic) {
      endpoint = `${baseUrl}/v1/messages`
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': providerConfig.apiKey,
        'anthropic-version': '2023-06-01',
      }
      payload = {
        model: body.modelName,
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: text }],
      }
    } else {
      endpoint = `${baseUrl}/chat/completions`
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerConfig.apiKey}`,
      }
      payload = {
        model: body.modelName,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const detail = await response.text()
      return jsonResponse({ error: `Provider refused the request: ${detail.slice(0, 300)}` }, 502)
    }

    const data = await response.json()
    const improved = isAnthropic
      ? (data?.content?.[0]?.text ?? '')
      : (data?.choices?.[0]?.message?.content ?? '')

    if (!String(improved).trim()) {
      return jsonResponse({ error: 'The provider returned an empty rewrite' }, 502)
    }

    return jsonResponse({ improved: String(improved).trim() })
  } catch (error) {
    return jsonResponse(
      { error: `Could not reach the provider: ${error instanceof Error ? error.message : 'unknown'}` },
      502
    )
  }
}
