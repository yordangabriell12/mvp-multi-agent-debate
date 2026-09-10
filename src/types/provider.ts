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
  apiKey: string
  models: AIModel[]
  enabled: boolean
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