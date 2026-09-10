// Shared instruction blocks appended to every agent prompt.
//
// Kept in one place so the discipline is identical across agents, moderator
// calls and the text improver. A model that only sees these rules sometimes
// ignores them, so they are appended to the request rather than the system
// prompt alone.

const NL = String.fromCharCode(10)

/**
 * Reduces invention. The failure mode being targeted is a confident answer
 * carrying made-up numbers, dates or sources, which is worse than no answer
 * because it looks checkable.
 */
export const EVIDENCE_RULES = [
  'EVIDENCE DISCIPLINE:',
  '1. Separate what you know from what you infer. Label inference: "I am inferring...".',
  '2. Never invent numbers, dates, names, quotes or sources. If you do not have a figure, say what would need to be measured to get it.',
  '3. Do not cite anything you cannot point to. "Studies show" without a specific study is not allowed.',
  '4. If the question cannot be answered from what you know, say so in one sentence and state what is missing.',
  '5. Distinguish fact ("the contract says X"), estimate ("roughly 3 to 6 months") and opinion ("I would push for X").',
  '6. A labelled guess is useful; an unlabelled one is harmful. Label it.',
].join(NL)

/**
 * Targets filler that makes text look generated: formulaic openers, banned
 * vocabulary, and sentences that carry no information.
 */
export const WRITING_RULES = [
  'WRITING RULES:',
  '1. No filler openers. Never start with "Great question", "Certainly", "Sure" or "Let me explain".',
  '2. Never use an em dash. Use a comma, a period or brackets.',
  '3. Never use these words: seamless, revolutionary, cutting edge, next generation, game changer, supercharge, unlock, empower, synergy, robust, holistic, delve, landscape (as filler), leverage (as a verb).',
  '4. Prefer the concrete over the abstract: "3 support tickets" instead of "a volume of cases".',
  '5. Vary sentence length. Do not stack sentences of the same shape.',
  '6. Delete any sentence that adds no information. Short and specific beats long and smooth.',
].join(NL)

/** Both blocks, for prompts that generate text a person will read. */
export const QUALITY_RULES = NL + EVIDENCE_RULES + NL + NL + WRITING_RULES + NL
