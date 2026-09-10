// Session tokens and password verification.
//
// Uses the Web Crypto API only, so the same module runs in both the Edge
// middleware and the Node.js API routes.

const encoder = new TextEncoder()

export const SESSION_COOKIE = 'vma_session'

const PBKDF2_ITERATIONS = 210000
const PBKDF2_KEY_BYTES = 32

export interface SessionPayload {
  /** Subject: the authenticated email address. */
  sub: string
  /** Issued at (unix seconds). */
  iat: number
  /** Expires at (unix seconds). */
  exp: number
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(input: string): Uint8Array<ArrayBuffer> {
  const normalised = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = (4 - (normalised.length % 4)) % 4
  const binary = atob(normalised + '='.repeat(padding))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Compares two byte arrays without leaking their contents through timing.
 * Length is allowed to leak: it is not secret here, and masking it would
 * require padding out to a worst-case size.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

async function pbkdf2(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<Uint8Array<ArrayBuffer>> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    PBKDF2_KEY_BYTES * 8
  )
  return new Uint8Array(bits)
}

/**
 * Produces a self-contained password hash: `pbkdf2:<iterations>:<salt>:<hash>`.
 * Run `node scripts/hash-password.mjs '<password>'` to generate one.
 *
 * Colon separated on purpose: base64url contains no colons, and a `$` in the
 * value would be treated as variable interpolation by Docker Compose and most
 * shells, which silently corrupts the hash.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toBase64Url(salt)}:${toBase64Url(derived)}`
}

interface ParsedHash {
  iterations: number
  salt: Uint8Array<ArrayBuffer>
  hash: Uint8Array<ArrayBuffer>
}

function parsePasswordHash(stored: string): ParsedHash | null {
  // The `$` form is the older layout; it is still accepted so existing
  // deployments keep working.
  const parts = stored.startsWith('pbkdf2:')
    ? stored.split(':')
    : stored.startsWith('pbkdf2$')
      ? stored.split('$')
      : null
  if (!parts || parts.length !== 4 || parts[0] !== 'pbkdf2') return null

  const iterations = Number.parseInt(parts[1], 10)
  if (!Number.isFinite(iterations) || iterations < 10000) return null

  try {
    return { iterations, salt: fromBase64Url(parts[2]), hash: fromBase64Url(parts[3]) }
  } catch {
    return null
  }
}

/**
 * Verifies a password against a stored hash. A bare plaintext value is also
 * accepted so `VMA_AUTH_PASSWORD` keeps working, but a hash is strongly
 * preferred: a leaked container environment should not hand over the password.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parsePasswordHash(stored)
  if (!parsed) {
    if (!stored) return false
    return timingSafeEqual(encoder.encode(password), encoder.encode(stored))
  }
  const derived = await pbkdf2(password, parsed.salt, parsed.iterations)
  return timingSafeEqual(derived, parsed.hash)
}

export async function createSessionToken(
  subject: string,
  secret: string,
  ttlSeconds: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = { sub: subject, iat: now, exp: now + ttlSeconds }
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)))
  const key = await importHmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  return `${body}.${toBase64Url(new Uint8Array(signature))}`
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<SessionPayload | null> {
  if (!token || !secret) return null
  const separator = token.lastIndexOf('.')
  if (separator <= 0) return null

  const body = token.slice(0, separator)
  const signature = token.slice(separator + 1)

  try {
    const key = await importHmacKey(secret)
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signature),
      encoder.encode(body)
    )
    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    return payload
  } catch {
    return null
  }
}

/** Constant-time-ish email comparison; lengths are not secret. */
export function safeEmailMatch(candidate: string, expected: string): boolean {
  return timingSafeEqual(encoder.encode(candidate), encoder.encode(expected))
}
