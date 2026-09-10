import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { ProviderConfig } from '@/types/provider'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function getProvider(providerConfig: ProviderConfig) {
  switch (providerConfig.id) {
    case 'openai':
      return createOpenAI({
        apiKey: providerConfig.apiKey,
        baseURL: providerConfig.baseUrl || undefined,
      })
    case 'anthropic':
      return createAnthropic({
        apiKey: providerConfig.apiKey,
        baseURL: providerConfig.baseUrl || undefined,
      })
    default:
      // OpenRouter and custom providers use OpenAI-compatible API
      return createOpenAI({
        apiKey: providerConfig.apiKey,
        baseURL: providerConfig.baseUrl,
      })
  }
}

export async function* streamChat(
  providerConfig: ProviderConfig,
  modelId: string,
  messages: ChatMessage[]
): AsyncGenerator<{ type: 'chunk' | 'error'; text?: string; error?: string }> {
  try {
    const provider = getProvider(providerConfig)
    const model = provider(modelId)

    const { streamText } = await import('ai')
    const result = await streamText({
      model,
      messages,
    })

    for await (const chunk of result.textStream) {
      yield { type: 'chunk', text: chunk }
    }
  } catch (err) {
    yield { type: 'error', error: err instanceof Error ? err.message : 'Unknown error' }
  }
}