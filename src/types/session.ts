export type PresetMode = 'boardroom' | 'supportive' | 'learning' | 'war' | 'custom'
export type LoopSpeed = 'slow' | 'normal' | 'fast'
export type SessionStatus = 'idle' | 'running' | 'paused'
export type ResponseMode = 'all' | 'auto' | 'tag'

export interface SessionSettings {
  loopSpeed: LoopSpeed
  maxRounds: number | 'unlimited'
  moderatorEnabled: boolean
  /**
   * Deep search for this session.
   *
   * Deliberately a session setting rather than a per-run snapshot: it is read
   * fresh at each agent turn, so switching it on or off takes effect from the
   * next turn and never leaves a run half-configured. Anything already gathered
   * stays in the conversation as ordinary messages, so turning it off does not
   * lose research that has already been collected.
   */
  deepSearch: boolean
  /** How many searches one agent may make in a single turn. */
  deepSearchMaxQueries?: number
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

/**
 * True when a value is one of the preset keys.
 *
 * Used when reading sessions back from storage, where the value may come from an
 * older build. Without this check an unrecognised key would be kept, and since no
 * preset card matches it the screen would show every option as inactive, which
 * reads as "you have not chosen a mode" rather than "that mode no longer exists".
 */
export function isPresetMode(value: unknown): value is PresetMode {
  return typeof value === 'string' && value in PRESET_MODES
}