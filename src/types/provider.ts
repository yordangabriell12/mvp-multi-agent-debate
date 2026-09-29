export type ProviderId = string

export interface AIModel {
  id: string
  name: string
  temperature?: number
}

export interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  /** Server-held. On the client this is always empty; check `hasKey` instead. */
  apiKey: string
  /**
   * Whether a key is stored on the server. Sent to the client so the UI can tell
   * a configured provider from an unused one without ever receiving the key.
   */
  hasKey?: boolean
  models: AIModel[]
  enabled: boolean
}

/**
 * Whether a usable key exists for this provider.
 *
 * Two fields answer the same question depending on who is asking. An
 * administrator receives the stored configuration, so their copy has `apiKey`.
 * Everyone else is sent providers with the key removed and `hasKey` set instead,
 * because a key they cannot see is a key they cannot leak. Checking both here
 * keeps every caller from having to know which situation it is in.
 */
export function providerHasKey(
  provider: Pick<ProviderConfig, 'apiKey' | 'hasKey'> | undefined | null
): boolean {
  if (!provider) return false
  return Boolean(provider.hasKey || provider.apiKey)
}

export const PRESET_PROVIDERS: Omit<ProviderConfig, 'apiKey'>[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'o1', name: 'o1' },
      { id: 'o1-mini', name: 'o1 Mini' },
    ],
    enabled: false,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    ],
    enabled: false,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'meta-llama/llama-3.1-405b', name: 'Llama 3.1 405B' },
      { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' },
      { id: 'mistralai/mixtral-8x22b', name: 'Mixtral 8x22B' },
    ],
    enabled: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      // These are the ids the API accepts, which are not the names shown on the
      // website. Sending the display name (for example "DeepSeek-V4-Flash") is
      // refused outright, and the refusal lists the ids that would have worked.
      // `deepseek-flash` accepts an image, so it can also serve as the reading
      // model for PDFs and scans.
      { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash (reads images)' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    ],
    enabled: false,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    models: [
      { id: 'llama3', name: 'Llama 3' },
      { id: 'mistral', name: 'Mistral' },
      { id: 'codellama', name: 'Code Llama' },
    ],
    enabled: false,
  },
]