export type PresetMode = 'boardroom' | 'supportive' | 'learning' | 'war' | 'custom'
export type LoopSpeed = 'slow' | 'normal' | 'fast'
export type SessionStatus = 'idle' | 'running' | 'paused'
export type ResponseMode = 'all' | 'auto' | 'tag'

export interface SessionSettings {
  loopSpeed: LoopSpeed
  maxRounds: number | 'unlimited'
  moderatorEnabled: boolean
  roleLock: boolean
}

export interface Session {
  id: string
  name: string
  agentIds: string[]
  presetMode: PresetMode
  settings: SessionSettings
  status: SessionStatus
  currentRound: number
  responseMode: ResponseMode
  createdAt: number
  updatedAt: number
  lastMessageAt?: number
}

export const PRESET_MODES: Record<PresetMode, { label: string; description: string; icon: string }> = {
  boardroom: {
    label: 'Boardroom',
    description: 'Structured debate for high-stakes decisions. Agents challenge each other to pressure-test ideas.',
    icon: '◻',
  },
  supportive: {
    label: 'Supportive',
    description: 'Collaborative discussion toward a shared goal. Agents build on each other\'s ideas.',
    icon: '○',
  },
  learning: {
    label: 'Learning',
    description: 'Agents teach and quiz each other. Great for studying complex topics.',
    icon: '△',
  },
  war: {
    label: 'War Room',
    description: 'Fast-paced brainstorming under pressure. Quick rounds, maximum output.',
    icon: '◇',
  },
  custom: {
    label: 'Custom',
    description: 'Your own configuration. Set the rules.',
    icon: '·',
  },
}