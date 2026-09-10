// Turns a provider's raw error body into something a person can act on.
//
// Providers nest the actual reason inside JSON, sometimes inside JSON inside
// JSON. A real 9router quota failure arrives like this:
//
//   {"error":{"message":"[openai/gpt-4o] [429]: {\"error\":{\"message\":\"You
//    have no credits remaining. Add credits to continue...\"}}"}}
//
// Shown raw in the chat that is unreadable, and it hides the one sentence that
// matters.

const MAX_LENGTH = 400

function unwrap(text: string, depth = 0): string {
  if (depth > 4) return text

  // Try the whole string first, then the first JSON object inside it. Providers
  // often prefix or wrap the payload, for example
  //   [openai/gpt-4o] [429]: {"error":{"message":"..."}} (reset after 2s)
  // where parsing the whole string fails but the embedded object is valid.
  const candidates = [text]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      const nested = parsed?.error
      const message =
        (typeof nested === 'object' && nested !== null
          ? (nested as Record<string, unknown>).message
          : undefined) ??
        parsed?.message ??
        nested ??
        parsed?.detail

      if (typeof message === 'string') {
        const trimmed = message.trim()
        // Guard against a message identical to the text it came from, which
        // would recurse without ever making progress.
        if (trimmed && trimmed !== text && trimmed !== candidate) {
          return unwrap(trimmed, depth + 1)
        }
      }
    } catch {
      // Not JSON at this candidate: try the next one, then fall through.
    }
  }
  return text
}

export function extractProviderError(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return 'The provider returned an empty error.'

  // Normalise before parsing. A real provider body can contain literal newlines
  // inside a JSON string, which makes it syntactically invalid JSON: parsing it
  // fails outright with "Bad control character in string literal". Collapsing
  // whitespace first makes the payload parseable, and the message is wanted on
  // a single line anyway.
  const cleaned = trimmed.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ')

  const message = unwrap(cleaned).trim()
  if (!message) return 'The provider returned an error with no message.'
  return message.length > MAX_LENGTH ? message.slice(0, MAX_LENGTH) + '...' : message
}
