import type { ProviderConfig } from '@/types/provider'
import { checkOutboundUrl } from '@/lib/netGuard'
import { checkChatRateLimit, maxBodyBytes } from '@/lib/rateLimit'

export const runtime = 'nodejs'

interface AgentConfig {
  id: string
  name: string
  systemPrompt: string
  provider: string
  modelName: string
  temperature?: number
}

interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[]
  agent: AgentConfig
  providers: ProviderConfig[]
}

function jsonResponse(payload: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function clientIp(req: Request): string {
  // Cloudflare overwrites this on every proxied request; X-Forwarded-For is
  // only a fallback because a direct connection can spoof it.
  const cfIp = req.headers.get('cf-connecting-ip')?.trim()
  if (cfIp) return cfIp
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * Reasoning models reject an explicit temperature, so only send it when the
 * caller set one and the target model accepts it.
 */
function resolveTemperature(agent: AgentConfig): number | undefined {
  if (typeof agent.temperature !== 'number' || !Number.isFinite(agent.temperature)) return undefined
  if (!agent.modelName) return undefined
  if (/^o\d/i.test(agent.modelName)) return undefined
  if (/-reason/i.test(agent.modelName)) return undefined
  return Math.min(2, Math.max(0, agent.temperature))
}

export async function POST(req: Request) {
  const limit = checkChatRateLimit(clientIp(req))
  if (!limit.allowed) {
    return jsonResponse({ error: 'Too many requests. Please slow down.' }, 429, {
      'Retry-After': String(limit.retryAfterSeconds),
    })
  }

  // Read as text first so an oversized body is rejected before parsing.
  const rawBody = await req.text()
  const byteCap = maxBodyBytes()
  if (rawBody.length > byteCap) {
    return jsonResponse({ error: `Request body too large (limit ${byteCap} bytes)` }, 413)
  }

  let body: ChatRequest
  try {
    body = JSON.parse(rawBody)
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { messages, agent, providers } = body
  if (!agent?.provider || !Array.isArray(messages) || !Array.isArray(providers)) {
    return jsonResponse({ error: 'Invalid request shape' }, 400)
  }

  const providerConfig = providers.find((p) => p.id === agent.provider)
  if (!providerConfig?.apiKey) {
    return jsonResponse({ error: `No API key for ${agent.provider}` }, 400)
  }

  // The base URL is attacker-controlled (it arrives in the request body), so it
  // must not be allowed to reach loopback or private addresses. Set
  // VMA_ALLOW_PRIVATE_BASEURL=true only when a provider genuinely lives on a
  // private network (for example a self-hosted Ollama instance).
  if (process.env.VMA_ALLOW_PRIVATE_BASEURL !== 'true') {
    const guard = checkOutboundUrl(providerConfig.baseUrl)
    if (!guard.ok) {
      return jsonResponse({ error: guard.reason }, 400)
    }
  }

  const temperature = resolveTemperature(agent)

  // Build OpenAI-compatible chat completions payload
  const fullMessages = [
    { role: 'system' as const, content: agent.systemPrompt },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  const baseUrl = providerConfig.baseUrl.replace(/\/$/, '')
  const isAnthropic = providerConfig.id === 'anthropic'

  try {
    let response: Response

    if (isAnthropic) {
      // Anthropic Messages API format
      const systemMsg = fullMessages.find(m => m.role === 'system')
      const chatMsgs = fullMessages.filter(m => m.role !== 'system')

      response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': providerConfig.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: agent.modelName,
          max_tokens: 4096,
          system: systemMsg?.content || '',
          messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
          // Anthropic caps temperature at 1.
          ...(temperature === undefined ? {} : { temperature: Math.min(1, temperature) }),
          stream: true,
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        return new Response(JSON.stringify({ error: err }), {
          status: response.status, headers: { 'Content-Type': 'application/json' },
        })
      }

      // Convert Anthropic SSE → `0:` format
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      const stream = new ReadableStream({
        async start(c) {
          try {
            let buffer = ''
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''
              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed || !trimmed.startsWith('data: ')) continue
                try {
                  const data = JSON.parse(trimmed.slice(6))
                  if (data.type === 'content_block_delta' && data.delta?.text) {
                    c.enqueue(new TextEncoder().encode('0:' + JSON.stringify(data.delta.text) + '\n'))
                  }
                } catch { /* skip */ }
              }
            }
          } catch { /* client disconnected */ }
          finally { try { c.close() } catch { /* already closed */ } }
        },
      })

      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
      })
    } else {
      // OpenAI-compatible format (OpenAI, OpenRouter, Ollama, custom)
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${providerConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: agent.modelName,
          messages: fullMessages,
          temperature: temperature ?? 0.7,
          max_tokens: 4096,
          stream: true,
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        return new Response(JSON.stringify({ error: err }), {
          status: response.status, headers: { 'Content-Type': 'application/json' },
        })
      }

      // Convert SSE stream → `0:` format
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      const stream = new ReadableStream({
        async start(c) {
          try {
            let buffer = ''
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''
              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed) continue
                if (trimmed === 'data: [DONE]') break
                if (trimmed.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(trimmed.slice(6))
                    const content = data.choices?.[0]?.delta?.content || ''
                    if (content) {
                      c.enqueue(new TextEncoder().encode('0:' + JSON.stringify(content) + '\n'))
                    }
                  } catch { /* skip */ }
                }
              }
            }
          } catch { /* client disconnected */ }
          finally { try { c.close() } catch { /* already closed */ } }
        },
      })

      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
      })
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: `Provider connection failed: ${error}` }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }
}


