import type { ProviderConfig } from '@/types/provider'
import { checkOutboundUrl } from '@/lib/netGuard'

export const runtime = 'nodejs'

interface AgentConfig {
  id: string
  name: string
  systemPrompt: string
  provider: string
  modelName: string
}

interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[]
  agent: AgentConfig
  providers: ProviderConfig[]
}

export async function POST(req: Request) {
  const body: ChatRequest = await req.json()
  const { messages, agent, providers } = body

  const providerConfig = providers.find((p) => p.id === agent.provider)
  if (!providerConfig?.apiKey) {
    return new Response(JSON.stringify({ error: `No API key for ${agent.provider}` }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // The base URL is attacker-controlled (it arrives in the request body), so it
  // must not be allowed to reach loopback or private addresses. Set
  // VMA_ALLOW_PRIVATE_BASEURL=true only when a provider genuinely lives on a
  // private network (for example a self-hosted Ollama instance).
  if (process.env.VMA_ALLOW_PRIVATE_BASEURL !== 'true') {
    const guard = checkOutboundUrl(providerConfig.baseUrl)
    if (!guard.ok) {
      return new Response(JSON.stringify({ error: guard.reason }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

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
          temperature: 0.7,
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


