// Working out which agents should answer a question.
//
// Three ways in, in this order: `@all` means everyone, an `@name` means exactly the
// people named, and anything else is routed by matching the question against what
// each agent is for.
//
// The routing part is why this lives in its own file. It used to be a flat list of
// English words checked against both the question and the agent's profile, and that
// quietly broke for Indonesian questions: a question has to share a word with the
// profile, the profiles are written in English ("VP of Sales", "Finance Advisor"),
// and so "berapa anggarannya?" matched nothing and the room answered with a single
// arbitrary agent. The product is Indonesian, so that was the common case, not the
// edge case. Grouping the words means the two sides only have to land in the same
// domain, in whatever language each happens to be written.

/** The parts of an agent that describe what it is for. */
export interface RoutableAgent {
  id: string
  name: string
  roleTitle: string
  systemPrompt: string
}

/**
 * Domains an agent can belong to, each holding the words both sides might use.
 *
 * A group is matched when one of its words appears in the agent's profile and one
 * appears in the question. That is deliberately not "the same word on both sides",
 * because the words are usually in different languages.
 */
const DOMAIN_KEYWORDS: string[][] = [
  [
    'finance', 'money', 'revenue', 'budget', 'cost', 'profit', 'cashflow', 'debt',
    'invest', 'pricing', 'keuangan', 'uang', 'anggaran', 'biaya', 'harga',
    'pendapatan', 'laba', 'untung', 'rugi', 'hutang', 'utang', 'modal', 'investasi',
    'belanja', 'tarif', 'tagihan', 'pengeluaran', 'hemat',
  ],
  [
    'sales', 'marketing', 'penjualan', 'pemasaran', 'promosi', 'pelanggan', 'pasar',
    'iklan', 'penawaran', 'kampanye', 'konversi',
  ],
  [
    'legal', 'law', 'contract', 'litigation', 'compliance', 'hukum', 'kontrak',
    'perjanjian', 'gugatan', 'regulasi', 'kepatuhan', 'izin', 'sengketa', 'somasi',
    'klausul', 'lisensi',
  ],
  ['risk', 'risiko', 'bahaya', 'ancaman', 'mitigasi', 'kerugian'],
  ['tax', 'pajak', 'ppn', 'pph'],
  ['hiring', 'rekrutmen', 'karyawan', 'sdm', 'pegawai', 'tenaga kerja', 'rekrut'],
  [
    'operasi', 'operations', 'process', 'proses', 'alur kerja', 'workflow',
    'efisiensi', 'sop', 'kapasitas', 'logistik',
  ],
]

/** How many agents an unrouted question is spread across, at most. */
const MAX_AUTO_AGENTS = 2

function profileOf(agent: RoutableAgent): string {
  return (agent.roleTitle + ' ' + agent.name + ' ' + agent.systemPrompt).toLowerCase()
}

/**
 * Scores an agent against a question, one point per domain they share.
 *
 * Returns 0 when the question and the profile have no domain in common, which the
 * caller reads as "no reason to prefer this agent over any other".
 */
export function scoreAgentForQuestion(agent: RoutableAgent, question: string): number {
  const profile = profileOf(agent)
  const lower = question.toLowerCase()

  let score = 0
  for (const group of DOMAIN_KEYWORDS) {
    const inProfile = group.some((word) => profile.includes(word))
    const inQuestion = group.some((word) => lower.includes(word))
    if (inProfile && inQuestion) score += 1
  }
  return score
}

/**
 * Picks the agents that should answer.
 *
 * An unrouted question goes to the agents that share a domain with it, or, when
 * nothing matches, to exactly one agent. One rather than all: a question that
 * names no subject and no specialist is better served by a single answer than by
 * three near-identical ones, and the room can still be addressed with `@all`.
 */
export function selectAgentsForQuestion<T extends RoutableAgent>(
  roomAgents: T[],
  content: string
): T[] {
  if (roomAgents.length === 0) return []

  if (/@all\b/i.test(content)) return roomAgents

  // A name that matches nobody is left to the routing below rather than answering
  // with silence: a typo should not look like a broken room.
  const mentions = (content.match(/@(\w+)/g) || []).map((m) => m.slice(1).toLowerCase())
  const named = roomAgents.filter((a) => mentions.includes(a.name.toLowerCase()))
  if (named.length > 0) return named

  const scored = roomAgents
    .map((agent) => ({ agent, score: scoreAgentForQuestion(agent, content) }))
    .sort((a, b) => b.score - a.score)

  const matched = scored.filter((entry) => entry.score > 0)
  if (matched.length > 0) return matched.slice(0, MAX_AUTO_AGENTS).map((entry) => entry.agent)

  return [scored[0].agent]
}
