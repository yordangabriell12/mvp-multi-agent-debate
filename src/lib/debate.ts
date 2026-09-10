// Pure debate logic, extracted from the useChat hook so it can be tested
// without a browser, a store, or a network call.

export const DECISION_ACTIONS = [
  'followup',
  'multi',
  'clarify',
  'challenge',
  'bridge',
  'elaborate',
  'redirect',
  'poll',
  'summary',
] as const

export type DecisionAction = (typeof DECISION_ACTIONS)[number]

export interface ModeratorDecision {
  action: DecisionAction
  agents?: string[]
  question?: string
}

export interface NamedAgent {
  id: string
  name: string
}

export interface RoomAgent extends NamedAgent {
  roleTitle: string
}

/**
 * Ceiling applied to "unlimited": a forgotten session must not bill forever.
 */
export const UNLIMITED_ROUND_CEILING = 10

/**
 * Repairs a stored round setting.
 *
 * "unlimited" used to be the default and was clamped to 2 in practice, so a
 * session still carrying it is a leftover rather than a choice someone made.
 * It is no longer offered in the interface, so it is mapped to the current
 * default instead of silently expanding to the ceiling.
 */
export function migrateRoundSetting(maxRounds: number | 'unlimited'): number {
  if (maxRounds === 'unlimited') return 1
  if (typeof maxRounds !== 'number' || !Number.isFinite(maxRounds)) return 1
  return Math.min(Math.max(1, Math.floor(maxRounds)), UNLIMITED_ROUND_CEILING)
}

/**
 * Total rounds to run, where the opening round counts as one. So a configured
 * value of 1 means the opening round only, with no extra rounds.
 *
 * Previously this was clamped to 2 for every input, which made the Max Rounds
 * setting in the sidebar do nothing: picking 20 still ran a single extra round.
 */
export function resolveRoundCap(maxRounds: number | 'unlimited'): number {
  if (maxRounds === 'unlimited') return UNLIMITED_ROUND_CEILING
  if (typeof maxRounds !== 'number' || !Number.isFinite(maxRounds)) return 1
  return Math.max(1, Math.floor(maxRounds))
}

function isDecisionAction(value: string): value is DecisionAction {
  return (DECISION_ACTIONS as readonly string[]).includes(value)
}

/** Finds agents whose name appears in the text, with or without an @ prefix. */
export function findAgentsInMessage<T extends RoomAgent>(text: string, roomAgents: T[]): NamedAgent[] {
  const found: NamedAgent[] = []
  const lower = text.toLowerCase()
  for (const agent of roomAgents) {
    const name = agent.name.toLowerCase()
    if (lower.includes(name) || lower.includes('@' + name)) {
      found.push({ id: agent.id, name: agent.name })
    }
  }
  return found
}

/** Collects unique `@Name` mentions that match an agent in the room. */
export function extractAgentTags(text: string, roomAgents: NamedAgent[]): string[] {
  const mentionPattern = text.match(/@(\w+)/g)
  if (!mentionPattern) return []

  const tags: string[] = []
  for (const mention of mentionPattern) {
    const name = mention.slice(1).toLowerCase()
    const agent = roomAgents.find((a) => a.name.toLowerCase() === name)
    if (agent) tags.push(agent.name)
  }
  return [...new Set(tags)]
}

/**
 * Reads the moderator's next action.
 *
 * Declared format is JSON: {"action":"FOLLOWUP","agents":["Maya"],"question":"..."}
 * A plain-text form is accepted as a fallback for models that ignore the
 * instruction:
 *   ACTION: FOLLOWUP
 *   AGENT: Maya
 *   QUESTION: ...
 *
 * Anything unparseable resolves to `summary`, which stops the loop. Stopping is
 * the safe direction: it cannot create an endless call loop or extra spend.
 */
export function parseDecision(text: string): ModeratorDecision {
  if (!text) return { action: 'summary' }

  try {
    const jsonMatch = text.match(/\{[^}]+\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        action?: unknown
        agents?: unknown
        agent?: unknown
        question?: unknown
      }

      if (!parsed.action) return { action: 'summary' }

      const rawAction = String(parsed.action).toLowerCase()
      if (rawAction === 'summary') return { action: 'summary' }

      const rawAgents = Array.isArray(parsed.agents)
        ? parsed.agents
        : parsed.agent
          ? [parsed.agent]
          : []
      const agents = rawAgents
        .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
        .map((name) => name.trim())

      return {
        // An unrecognised action is treated as a plain follow-up rather than
        // silently ending the discussion.
        action: isDecisionAction(rawAction) ? rawAction : 'followup',
        agents,
        question: typeof parsed.question === 'string' ? parsed.question : undefined,
      }
    }
  } catch {
    // fall through to the plain-text form
  }

  const actionMatch = text.match(/ACTION:\s*(SUMMARY|FOLLOWUP)/i)
  if (!actionMatch || actionMatch[1].toUpperCase() === 'SUMMARY') return { action: 'summary' }

  const agentMatch = text.match(/AGENT:\s*(.+)/i)
  const questionMatch = text.match(/QUESTION:\s*(.+)/i)
  if (!agentMatch || !questionMatch) return { action: 'summary' }

  return {
    action: 'followup',
    agents: [agentMatch[1].trim()],
    question: questionMatch[1].trim(),
  }
}
