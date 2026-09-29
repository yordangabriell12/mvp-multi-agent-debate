// Output budget and tuning for models that think before they answer.
//
// The bug this exists to prevent: a flat max_tokens of 4096 was sent to every model.
// A reasoning model spends that budget inside `reasoning_content` before writing a
// single character of the answer, so it came back as an empty string with
// `finish_reason: "length"` and the agent bubble rendered blank. That reads as a
// model with nothing to say, which is the opposite of what happened.
//
// Measured against a real GLM-5.3 call: 11938 tokens of thinking before the answer,
// on a one-line prompt asking for a picture. The old ceiling was one third of that.

/** Ceiling for models with no thinking phase. Unchanged from the original value. */
export const DEFAULT_MAX_TOKENS = 4096

/** Ceiling for models that think first: room to reason and still write the answer. */
export const REASONING_MAX_TOKENS = 32_768

/**
 * Models known to emit `reasoning_content` before the answer.
 *
 * Matched on the model id the user typed, which is the only thing available before
 * the request is sent. A false negative costs an unnecessarily small budget; a false
 * positive costs nothing, because the larger ceiling is harmless to a normal model.
 */
export function isReasoningModel(modelName: string): boolean {
  if (!modelName) return false
  return (
    /^o\d/i.test(modelName) ||      // o1, o3, o4
    /-reason/i.test(modelName) ||   // deepseek-reasoner, *-reasoning
    /glm-?\d/i.test(modelName) ||   // GLM-5.3, glm4
    /\bthinking\b/i.test(modelName)
  )
}

export function resolveMaxTokens(modelName: string): number {
  return isReasoningModel(modelName) ? REASONING_MAX_TOKENS : DEFAULT_MAX_TOKENS
}

/**
 * Switches the thinking phase off, but only for the family that was measured.
 *
 * GLM-5.3 accepts `thinking: {type:"disabled"}` and drops from 92 seconds to 3 on the
 * same prompt, which is the difference between a usable room and a timed-out one. The
 * flag is deliberately not sent to the other reasoning families (`o1`, `o3`,
 * `-reason`): they take different parameters and reject unknown fields with a 400, so
 * guessing would break providers that currently work in order to speed up one.
 */
export function reasoningTuningFor(modelName: string): Record<string, unknown> {
  if (!/glm-?\d/i.test(modelName || '')) return {}
  return { thinking: { type: 'disabled' } }
}
