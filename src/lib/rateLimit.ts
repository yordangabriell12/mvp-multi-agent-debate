// In-memory throttle for the login endpoint.
//
// The app runs as a single Node.js process in one container, so a module-level
// Map is enough here. If it is ever scaled horizontally this must move to a
// shared store (Redis) or the limit becomes per-replica.

const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60 * 1000
const LOCKOUT_MS = 15 * 60 * 1000
const SWEEP_INTERVAL_MS = 5 * 60 * 1000

interface Bucket {
  failures: number
  firstFailureAt: number
  lockedUntil: number
}

const buckets = new Map<string, Bucket>()
const chatWindows = new Map<string, number[]>()
let lastSweep = Date.now()

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
  remaining: number
}

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    const idle = now - Math.max(bucket.firstFailureAt, bucket.lockedUntil)
    if (idle > WINDOW_MS + LOCKOUT_MS) buckets.delete(key)
  }
  for (const [key, hits] of chatWindows) {
    if (hits.length === 0 || now - hits[hits.length - 1] > 60 * 60 * 1000) chatWindows.delete(key)
  }
}

function fresh(): Bucket {
  return { failures: 0, firstFailureAt: Date.now(), lockedUntil: 0 }
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket) return { allowed: true, retryAfterSeconds: 0, remaining: MAX_FAILURES }

  if (bucket.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.lockedUntil - now) / 1000),
      remaining: 0,
    }
  }

  if (now - bucket.firstFailureAt > WINDOW_MS) {
    buckets.delete(key)
    return { allowed: true, retryAfterSeconds: 0, remaining: MAX_FAILURES }
  }

  const remaining = Math.max(0, MAX_FAILURES - bucket.failures)
  return {
    allowed: remaining > 0,
    retryAfterSeconds: remaining > 0 ? 0 : Math.ceil(LOCKOUT_MS / 1000),
    remaining,
  }
}

export function recordFailure(key: string): void {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || now - bucket.firstFailureAt > WINDOW_MS) {
    buckets.set(key, { ...fresh(), failures: 1 })
    return
  }

  bucket.failures += 1
  if (bucket.failures >= MAX_FAILURES) bucket.lockedUntil = now + LOCKOUT_MS
}

export function clearFailures(key: string): void {
  buckets.delete(key)
}

// --- Global backstop -------------------------------------------------------
//
// Per-IP keys can be sidestepped: when the origin is reached directly (bypassing
// Cloudflare) the X-Forwarded-For header is attacker-controlled, so every request
// can present a fresh "IP". Bytes cannot be spoofed by header, so cap the total
// failure rate as well. Normal traffic never reaches these numbers.

const GLOBAL_WINDOW_MS = 10 * 60 * 1000
const GLOBAL_SOFT_LIMIT = 15
const GLOBAL_HARD_LIMIT = 40
const GLOBAL_COOLDOWN_MS = 120 * 1000
const MAX_GLOBAL_SAMPLES = 5000

let globalFailures: number[] = []

export interface GlobalPressure {
  /** Extra pause to add before answering, in milliseconds. */
  extraDelayMs: number
  blocked: boolean
  retryAfterSeconds: number
}

export function globalPressure(): GlobalPressure {
  const now = Date.now()
  globalFailures = globalFailures.filter((at) => now - at < GLOBAL_WINDOW_MS)
  const count = globalFailures.length

  if (count >= GLOBAL_HARD_LIMIT) {
    return { extraDelayMs: 0, blocked: true, retryAfterSeconds: Math.ceil(GLOBAL_COOLDOWN_MS / 1000) }
  }
  if (count >= GLOBAL_SOFT_LIMIT) {
    const extraDelayMs = Math.min(3000, 500 + (count - GLOBAL_SOFT_LIMIT) * 100)
    return { extraDelayMs, blocked: false, retryAfterSeconds: 0 }
  }
  return { extraDelayMs: 0, blocked: false, retryAfterSeconds: 0 }
}

export function recordGlobalFailure(): void {
  globalFailures.push(Date.now())
  if (globalFailures.length > MAX_GLOBAL_SAMPLES) {
    globalFailures = globalFailures.slice(-MAX_GLOBAL_SAMPLES)
  }
}

// --- Chat cost guard -------------------------------------------------------
//
// `/api/chat` spends money on every call, so it needs a ceiling. The limit is
// deliberately loose: one debate turn fans out into many internal calls (each
// moderator decision, each agent reply, each consensus check is a request), so
// a tight per-request limit would break normal use. This guards against a
// runaway client or a leaked session, not against a genuine burst.

const DEFAULT_CHAT_MAX_REQUESTS = 150
const DEFAULT_CHAT_WINDOW_MS = 5 * 60 * 1000

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function chatRateLimits(): { maxRequests: number; windowMs: number } {
  return {
    maxRequests: positiveInt(process.env.VMA_CHAT_MAX_REQUESTS, DEFAULT_CHAT_MAX_REQUESTS),
    windowMs: positiveInt(process.env.VMA_CHAT_WINDOW_SECONDS, DEFAULT_CHAT_WINDOW_MS / 1000) * 1000,
  }
}

export function maxBodyBytes(): number {
  return positiveInt(process.env.VMA_MAX_BODY_BYTES, 1_000_000)
}

export interface ChatLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

export function checkChatRateLimit(key: string): ChatLimitResult {
  const { maxRequests, windowMs } = chatRateLimits()
  const now = Date.now()

  sweep(now)

  const recent = (chatWindows.get(key) ?? []).filter((at) => now - at < windowMs)
  if (recent.length >= maxRequests) {
    const oldest = recent[0]
    chatWindows.set(key, recent)
    return { allowed: false, retryAfterSeconds: Math.ceil((oldest + windowMs - now) / 1000) }
  }

  recent.push(now)
  chatWindows.set(key, recent)
  return { allowed: true, retryAfterSeconds: 0 }
}


