// Keeping the agents' searches apart.
//
// The failure this exists for: ask three agents a question and all three look up the same
// thing. Each one plans in isolation, sees only its own role and the question, and reaches
// for the most obvious phrasing, so the room pays for three searches and reads one result
// set three times. The answers then overlap and the debate has nothing to argue about.
//
// Two mechanisms live here. Normalisation decides when two queries are really the same
// query, so "tarif PPh badan 2024" and "2024 tarif PPh badan" count as one. It is
// deliberately token-based rather than string-based: word order is not a different search.
//
// The planner is told what has already been searched, which is the useful half, but a model
// can ignore an instruction. So the exclusion is also enforced here, in code, where the
// result does not depend on the model complying.

/** Words too common to carry meaning when comparing two queries. */
const STOPWORDS = new Set([
  'a', 'adalah', 'an', 'and', 'atau', 'apa', 'are', 'bagaimana', 'dan', 'dari', 'di',
  'for', 'in', 'is', 'itu', 'of', 'on', 'or', 'pada', 'the', 'to', 'untuk', 'yang',
  'with', 'what', 'how', 'why',
])

/** The words of a query, lowercased, without punctuation or meaning-free words. */
export function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token))
}

/**
 * A canonical form of a query, for comparing two of them.
 *
 * Tokens are sorted, so reordering the same words produces the same key. That is the case
 * worth catching: a planner that rewrites "tarif PPh badan 2024" as "PPh badan tarif 2024"
 * has not found a new angle, it has found the same page.
 */
export function normaliseQuery(query: string): string {
  return queryTokens(query).sort().join(' ')
}

/**
 * Whether two queries would return substantially the same results.
 *
 * Equality of the canonical form catches a reordering. A query that is a subset of another
 * is also treated as the same search, because "tarif PPh badan" and "tarif PPh badan 2024"
 * differ by one qualifier and not by angle. An empty token list never matches, so a query
 * made entirely of stopwords is left alone rather than collapsed into every other one.
 */
export function areSameQuery(a: string, b: string): boolean {
  const left = normaliseQuery(a)
  const right = normaliseQuery(b)
  if (!left || !right) return false
  if (left === right) return true

  const leftTokens = left.split(' ')
  const rightTokens = new Set(right.split(' '))
  const smaller = leftTokens.length <= rightTokens.size ? leftTokens : [...rightTokens]
  const larger = leftTokens.length <= rightTokens.size ? rightTokens : new Set(leftTokens)

  // Two tokens is the floor: a single shared word ("pajak") says nothing about the angle.
  if (smaller.length < 2) return false
  return smaller.every((token) => larger.has(token))
}

/**
 * The queries worth running, given what has already been searched.
 *
 * Duplicates within `candidates` are removed too, so a planner that repeats itself costs
 * one search rather than two. This is what makes the outcome independent of the model
 * obeying the instruction to differ.
 */
export function distinctQueries(candidates: readonly string[], used: readonly string[] = []): string[] {
  const kept: string[] = []

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    if (!trimmed) continue
    // Compared against what other agents already ran and against what this agent has kept
    // so far, so a repeat is caught even when the wording moved around.
    if ([...used, ...kept].some((other) => areSameQuery(trimmed, other))) continue
    kept.push(trimmed)
  }

  return kept
}
