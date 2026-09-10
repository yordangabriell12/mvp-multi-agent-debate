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

