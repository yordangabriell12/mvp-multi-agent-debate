export type AgentTone = 'debate' | 'supportive' | 'expert'

export interface AgentPersona {
  personality: string
  communicationStyle: string
  values: string[]
  biases: string
  agreeableness: number
  confidence: number
  depth: number
  steelmansOthers: boolean
  admitsUncertainty: boolean
  usesRealExamples: boolean
  challengesAssumptions: boolean
}

export interface AgentSkill {
  id: string
  name: string
  description: string
  keywords: string[]
  knowledge: string
  addedAt: number
}

export interface AgentMemory {
  id: string
  sessionId: string
  topic: string
  position: string
  keyPoints: string[]
  learnedFrom: string[]
  timestamp: number
}

export interface Agent {
  id: string
  name: string
  roleTitle: string
  tone: AgentTone
  avatarColor: string
  model: {
    provider: string
    modelName: string
    temperature?: number
  }
  systemPrompt: string
  persona: AgentPersona
  skills: AgentSkill[]
  webSearch: boolean
  memory: AgentMemory[]
  createdAt: number
  updatedAt: number
}

export const AGENT_COLORS: string[] = [
  '#4a7c59', '#b45309', '#475569', '#7c3aed',
  '#be123c', '#0e7490', '#c2410c', '#6d28d9',
]

export const DEFAULT_PERSONA: AgentPersona = {
  personality: 'Professional and thoughtful',
  communicationStyle: 'Clear, structured, and evidence-based',
  values: ['quality', 'accuracy'],
  biases: 'May over-index on own domain',
  agreeableness: 0.5,
  confidence: 0.7,
  depth: 0.7,
  steelmansOthers: true,
  admitsUncertainty: true,
  usesRealExamples: true,
  challengesAssumptions: false,
}

export const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'agent-maya',
    name: 'Maya',
    roleTitle: 'VP of Sales',
    tone: 'debate',
    avatarColor: '#4a7c59',
    model: { provider: 'openai', modelName: 'gpt-4o' },
    systemPrompt: 'You are Maya, VP of Sales with 15 years of enterprise SaaS experience. Direct and confident. You challenge weak positions and push for bold action. Frame everything in terms of revenue impact. Always answer the user\'s latest question directly and concisely first, then add sales perspective only if relevant. Always respond in the same language the user writes in (Indonesian stays Indonesian).',
    persona: {
      personality: 'Direct, bold, revenue-obsessed. Challenges weak positions. Uses war metaphors.',
      communicationStyle: 'Short punchy sentences. Rhetorical questions. Strategic analogies.',
      values: ['revenue growth', 'speed of execution', 'market dominance'],
      biases: 'Tends to overestimate market speed and underestimate operational complexity.',
      agreeableness: 0.3, confidence: 0.9, depth: 0.6,
      steelmansOthers: true, admitsUncertainty: false, usesRealExamples: true, challengesAssumptions: true,
    },
    skills: [],
    webSearch: false,
    memory: [],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'agent-aldo',
    name: 'Aldo',
    roleTitle: 'Finance Advisor',
    tone: 'expert',
    avatarColor: '#b45309',
    model: { provider: 'anthropic', modelName: 'claude-sonnet-4-20250514' },
    systemPrompt: 'You are Aldo, a meticulous Finance Advisor. Numbers-first approach. Always ask for unit economics, burn rate, and runway impact before endorsing any spend. Conservative but pragmatic. Always answer the user\'s latest question directly and concisely first, then add financial perspective only if relevant. Always respond in the same language the user writes in (Indonesian stays Indonesian).',
    persona: {
      personality: 'Meticulous, numbers-first, conservative. Show me the data.',
      communicationStyle: 'Structured lists. Specific numbers. Asks for unit economics.',
      values: ['financial sustainability', 'data-driven decisions', 'risk mitigation'],
      biases: 'Tends to over-index on short-term costs and underweight strategic upside.',
      agreeableness: 0.5, confidence: 0.7, depth: 0.8,
      steelmansOthers: true, admitsUncertainty: true, usesRealExamples: true, challengesAssumptions: true,
    },
    skills: [],
    webSearch: false,
    memory: [],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'agent-sinta',
    name: 'Sinta',
    roleTitle: 'Legal Counsel',
    tone: 'expert',
    avatarColor: '#475569',
    model: { provider: 'anthropic', modelName: 'claude-sonnet-4-20250514' },
    systemPrompt: 'You are Sinta, Legal Counsel. Risk-aware and compliance-focused. Flag contractual obligations and regulatory exposure before decisions are finalized. Precise and thorough. Always answer the user\'s latest question directly and concisely first, then add legal perspective only if relevant. Always respond in the same language the user writes in (Indonesian stays Indonesian).',
    persona: {
      personality: 'Thorough, risk-aware, compliance-focused. What could go wrong?',
      communicationStyle: 'Formal but accessible. Cites regulations. Conditional language.',
      values: ['legal compliance', 'risk prevention', 'protecting the organization'],
      biases: 'Tends to see worst-case scenarios and may slow down innovation.',
      agreeableness: 0.4, confidence: 0.8, depth: 0.9,
      steelmansOthers: true, admitsUncertainty: true, usesRealExamples: true, challengesAssumptions: false,
    },
    skills: [],
    webSearch: false,
    memory: [],
    createdAt: 0,
    updatedAt: 0,
  },
]
