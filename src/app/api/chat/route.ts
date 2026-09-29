import { checkChatRateLimit, maxBodyBytes } from '@/lib/rateLimit'
import { extractProviderError } from '@/lib/providerError'
import { resolveProvider } from '@/lib/providerResolver'
import { getCurrentUser } from '@/lib/session'
import { resolveMaxTokens, reasoningTuningFor } from '@/lib/reasoningBudget'

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
}

function jsonResponse(payload: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

/**
 * How long a provider may go silent before the turn is given up.
 *
 * Two minutes of nothing, not two minutes in total. A reasoning model can think for
 * a long while before its first token and then stream for another minute, so a fixed
 * deadline would cut off answers that are arriving perfectly well.
 *
 * Without any limit, a provider that accepts the connection and then stalls leaves
 * the agent spinning for as long as the browser is open, with nothing on screen to
 * explain it and no way out except Stop. Every other outbound call in the app
 * already has a limit (OCR 120s, web search 15-20s); this route had none.
 */
const PROVIDER_STALL_TIMEOUT_MS = 120_000

/** The line appended to an answer that was cut short, phrased as the app's own voice. */
const STALL_NOTICE = '\n\n[koneksi ke provider terputus setelah 120 detik tanpa respons]'

/**
 * Shown when a reasoning model used its whole output budget on thinking and never
 * got to the answer. Without this the agent bubble was simply blank, which reads as
 * the model refusing to answer rather than as a budget problem the user can fix.
 */
const BUDGET_NOTICE =
  '\n\n[model kehabisan jatah token saat berpikir dan tidak sempat menjawab. ' +
  'Coba lagi, atau pilih model tanpa mode berpikir.]'

/** Shown when the provider closed the stream cleanly without ever sending text. */
const EMPTY_NOTICE = '\n\n[provider menutup koneksi tanpa mengirim jawaban apa pun]'

/**
 * Reads an upstream body, giving up if the provider stops sending.
 *
 * The abort is what makes the hang end, and the notice is what makes it honest: a
 * truncated answer that looks complete is worse than one that says it was cut short.
 */
async function* readWithStallWatchdog(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
  onStall: () => void
): AsyncGenerator<Uint8Array> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const reset = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      onStall()
      controller.abort()
    }, PROVIDER_STALL_TIMEOUT_MS)
  }

  reset()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      reset()
      if (value) yield value
    }
  } finally {
    clearTimeout(timer)
  }
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

/**
 * Output budget, sized to leave a reasoning model room to think *and* answer.
 *
 * Kept in `@/lib/reasoningBudget` so the rule is unit-tested; a flat 4096 here was
 * what made reasoning models answer with an empty string.
 */
const maxTokensFor = (agent: AgentConfig) => resolveMaxTokens(agent.modelName || '')

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

  const { messages, agent } = body
  if (!agent?.provider || !Array.isArray(messages)) {
    return jsonResponse({ error: 'Invalid request shape' }, 400)
  }

  const account = await getCurrentUser()
  if (!account) return jsonResponse({ error: 'Unauthorized' }, 401)

  // The key is read from this account's stored configuration, never from the
  // request. A body that still carries a `providers` array is ignored, so an
  // older client cannot reintroduce the leak.
  const resolved = await resolveProvider(account.id, agent.provider)
  if (!resolved.ok) {
    return jsonResponse({ error: resolved.error }, resolved.status)
  }
  const providerConfig = resolved.provider

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
      // One controller per branch: it is the handle that both the request and the
      // stream watchdog use to stop a provider that has gone quiet.
      const controller = new AbortController()

      response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': providerConfig.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: agent.modelName,
          max_tokens: maxTokensFor(agent),
          system: systemMsg?.content || '',
          messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
          // Anthropic caps temperature at 1.
          ...(temperature === undefined ? {} : { temperature: Math.min(1, temperature) }),
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.text()
        return jsonResponse({ error: extractProviderError(err) }, response.status)
      }

      // Convert Anthropic SSE → `0:` format
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      const stream = new ReadableStream({
        async start(c) {
          let stalled = false
          let sawContent = false
          try {
            let buffer = ''
            for await (const value of readWithStallWatchdog(reader, controller, () => { stalled = true })) {
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''
              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed || !trimmed.startsWith('data: ')) continue
                try {
                  const data = JSON.parse(trimmed.slice(6))
                  if (data.type === 'content_block_delta' && data.delta?.text) {
                    sawContent = true
                    c.enqueue(new TextEncoder().encode('0:' + JSON.stringify(data.delta.text) + '\n'))
                  }
                } catch { /* skip */ }
              }
            }
            // Same guard as the OpenAI branch: a clean end with no text is a blank
            // bubble unless the route says what happened.
            if (!sawContent && !stalled) {
              c.enqueue(new TextEncoder().encode('0:' + JSON.stringify(EMPTY_NOTICE) + '\n'))
            }
          } catch {
            // A stall aborts the upstream request, and that surfaces here as a read
            // failure. The notice is what tells the reader that an answer which looks
            // finished was actually cut off.
            if (stalled) {
              try { c.enqueue(new TextEncoder().encode('0:' + JSON.stringify(STALL_NOTICE) + '\n')) } catch { /* closed */ }
            }
          }
          finally { try { c.close() } catch { /* already closed */ } }
        },
      })

      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
      })
    } else {
      // OpenAI-compatible format (OpenAI, OpenRouter, Ollama, custom)
      const controller = new AbortController()
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
          max_tokens: maxTokensFor(agent),
          stream: true,
          ...reasoningTuningFor(agent.modelName || ""),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.text()
        return jsonResponse({ error: extractProviderError(err) }, response.status)
      }

      // Convert SSE stream → `0:` format
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      const stream = new ReadableStream({
        async start(c) {
          let stalled = false
          let sawReasoning = false
          try {
            let buffer = ''
            let sawContent = false
            for await (const value of readWithStallWatchdog(reader, controller, () => { stalled = true })) {
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
                    const delta = data.choices?.[0]?.delta
                    const content = delta?.content || ''
                    if (content) {
                      sawContent = true
                      c.enqueue(new TextEncoder().encode('0:' + JSON.stringify(content) + '\n'))
                    }
                    // `reasoning_content` is the model thinking out loud. It is not the
                    // answer and must not be shown as one, but its presence is the only
                    // warning available that a reasoning model is eating the budget.
                    if (delta?.reasoning_content) sawReasoning = true
                  } catch { /* skip */ }
                }
              }
            }

            // An empty answer used to be silent. The provider had plenty to say and
            // ran out of budget while saying it, so the bubble has to explain itself
            // instead of looking like a model with nothing to offer.
            if (!sawContent && !stalled) {
              c.enqueue(new TextEncoder().encode('0:' + JSON.stringify(
                sawReasoning ? BUDGET_NOTICE : EMPTY_NOTICE
              ) + '\n'))
            }
          } catch {
            // A stall aborts the upstream request, and that surfaces here as a read
            // failure. The notice is what tells the reader that an answer which looks
            // finished was actually cut off.
            if (stalled) {
              try { c.enqueue(new TextEncoder().encode('0:' + JSON.stringify(STALL_NOTICE) + '\n')) } catch { /* closed */ }
            }
          }
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


