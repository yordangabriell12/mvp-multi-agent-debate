import { describe, expect, it } from 'vitest'
import {
  createSessionToken,
  hashPassword,
  safeEmailMatch,
  verifyPassword,
  verifySessionToken,
} from './auth'

const SECRET = 'test-secret-that-is-long-enough-for-hmac'

describe('hashPassword', () => {
  it('produces the colon-separated format', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash.startsWith('pbkdf2:')).toBe(true)
    expect(hash.split(':')).toHaveLength(4)
  })

  // A dollar sign in the value would be interpolated away by Docker Compose.
  it('never contains a dollar sign', async () => {
    const hash = await hashPassword('anything')
    expect(hash).not.toContain('$')
  })

  it('uses a fresh salt each time', async () => {
    const a = await hashPassword('same password')
    const b = await hashPassword('same password')
    expect(a).not.toBe(b)
  })
})

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    const hash = await hashPassword('s3cret-passphrase')
    expect(await verifyPassword('s3cret-passphrase', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('s3cret-passphrase')
    expect(await verifyPassword('s3cret-passphras', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
    expect(await verifyPassword('S3CRET-PASSPHRASE', hash)).toBe(false)
  })

  it('still accepts the older dollar-separated format', async () => {
    const colonHash = await hashPassword('legacy-check')
    const legacyHash = colonHash.replace(/:/g, '$')
    expect(await verifyPassword('legacy-check', legacyHash)).toBe(true)
  })

  it('accepts a plaintext value so VMA_AUTH_PASSWORD keeps working', async () => {
    expect(await verifyPassword('plain-value', 'plain-value')).toBe(true)
    expect(await verifyPassword('wrong', 'plain-value')).toBe(false)
  })

  it('rejects an empty stored value', async () => {
    expect(await verifyPassword('anything', '')).toBe(false)
  })

  it('rejects a malformed hash instead of throwing', async () => {
    expect(await verifyPassword('x', 'pbkdf2:notanumber:aa:bb')).toBe(false)
    expect(await verifyPassword('x', 'pbkdf2:1:aa:bb')).toBe(false)
    expect(await verifyPassword('x', 'pbkdf2:210000:!!!:!!!')).toBe(false)
  })
})

describe('session tokens', () => {
  it('round-trips a valid token', async () => {
    const token = await createSessionToken('me@example.com', SECRET, 3600)
    const payload = await verifySessionToken(token, SECRET)
    expect(payload?.sub).toBe('me@example.com')
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken('me@example.com', SECRET, 3600)
    expect(await verifySessionToken(token, 'a-different-secret')).toBeNull()
  })

  it('rejects a tampered payload', async () => {
    const token = await createSessionToken('me@example.com', SECRET, 3600)
    const [body, signature] = token.split('.')
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: 'attacker@example.com', iat: 0, exp: 9999999999 })
    ).toString('base64url')
    expect(await verifySessionToken(`${forgedBody}.${signature}`, SECRET)).toBeNull()
    expect(await verifySessionToken(`${body}.forged`, SECRET)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await createSessionToken('me@example.com', SECRET, -10)
    expect(await verifySessionToken(token, SECRET)).toBeNull()
  })

  it('rejects missing or malformed input', async () => {
    expect(await verifySessionToken(undefined, SECRET)).toBeNull()
    expect(await verifySessionToken('', SECRET)).toBeNull()
    expect(await verifySessionToken('no-dot-here', SECRET)).toBeNull()
    expect(await verifySessionToken('a.b', SECRET)).toBeNull()
  })

  it('rejects any token when the secret is missing', async () => {
    const token = await createSessionToken('me@example.com', SECRET, 3600)
    expect(await verifySessionToken(token, '')).toBeNull()
  })
})

describe('safeEmailMatch', () => {
  it('matches identical addresses', () => {
    expect(safeEmailMatch('me@example.com', 'me@example.com')).toBe(true)
  })

  it('rejects different addresses and different lengths', () => {
    expect(safeEmailMatch('me@example.com', 'you@example.com')).toBe(false)
    expect(safeEmailMatch('me@example.com', 'me@example.co')).toBe(false)
    expect(safeEmailMatch('', 'me@example.com')).toBe(false)
  })
})
