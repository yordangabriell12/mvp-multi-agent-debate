// Server-side storage for the workspace configuration.
//
// The provider list holds API keys, so the whole payload is encrypted at rest
// with AES-256-GCM. The key is derived from VMA_CONFIG_KEY (falling back to
// VMA_SESSION_SECRET, which every deployment already has), so a copy of the
// data file alone is not enough to read the keys.
//
// Writes are atomic: content goes to a temporary file first and is then renamed
// over the target, because a crash midway through a plain write would leave a
// truncated file that fails to parse on the next boot.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = process.env.VMA_DATA_DIR || path.join(process.cwd(), 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')

/** Refuse payloads beyond this. localStorage-scale data only, not file storage. */
export const MAX_CONFIG_BYTES = 8 * 1024 * 1024

interface ConfigEnvelope {
  version: 1
  updatedAt: number
  /** iv.tag.ciphertext, each base64url. */
  payload: string
}

function encryptionKey(): Buffer | null {
  const secret = process.env.VMA_CONFIG_KEY || process.env.VMA_SESSION_SECRET || ''
  if (!secret) return null
  return crypto.createHash('sha256').update(secret).digest()
}

function encrypt(plain: string, key: Buffer): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.')
}

function decrypt(blob: string, key: Buffer): string | null {
  try {
    const [ivPart, tagPart, dataPart] = blob.split('.')
    if (!ivPart || !tagPart || !dataPart) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ])
    return plain.toString('utf8')
  } catch {
    // Wrong key or tampered data: both mean "cannot read", which is the same to us.
    return null
  }
}

export interface ConfigReadResult {
  config: unknown | null
  updatedAt: number | null
  /** Set when a stored file exists but cannot be read, so the caller can warn. */
  error?: string
}

export async function readConfig(): Promise<ConfigReadResult> {
  let raw: string
  try {
    raw = await fs.readFile(CONFIG_FILE, 'utf8')
  } catch {
    return { config: null, updatedAt: null }
  }

  let envelope: ConfigEnvelope
  try {
    envelope = JSON.parse(raw)
  } catch {
    return { config: null, updatedAt: null, error: 'Stored configuration is not valid JSON.' }
  }

  const key = encryptionKey()
  if (!key) {
    return { config: null, updatedAt: null, error: 'No encryption key configured.' }
  }

  const plain = decrypt(envelope.payload, key)
  if (plain === null) {
    return {
      config: null,
      updatedAt: null,
      error: 'Stored configuration could not be decrypted. The encryption key may have changed.',
    }
  }

  try {
    return { config: JSON.parse(plain), updatedAt: envelope.updatedAt }
  } catch {
    return { config: null, updatedAt: null, error: 'Stored configuration is corrupt.' }
  }
}

export interface ConfigWriteResult {
  ok: boolean
  updatedAt?: number
  error?: string
}

export async function writeConfig(config: unknown): Promise<ConfigWriteResult> {
  const key = encryptionKey()
  if (!key) {
    return { ok: false, error: 'No encryption key configured; refusing to store secrets unencrypted.' }
  }

  const plain = JSON.stringify(config)
  if (Buffer.byteLength(plain, 'utf8') > MAX_CONFIG_BYTES) {
    return { ok: false, error: `Configuration exceeds ${MAX_CONFIG_BYTES} bytes.` }
  }

  const envelope: ConfigEnvelope = {
    version: 1,
    updatedAt: Date.now(),
    payload: encrypt(plain, key),
  }

  const temporary = `${CONFIG_FILE}.${process.pid}.tmp`
  try {
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
    await fs.writeFile(temporary, JSON.stringify(envelope), { mode: 0o600 })
    await fs.rename(temporary, CONFIG_FILE)
    return { ok: true, updatedAt: envelope.updatedAt }
  } catch (err) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    return { ok: false, error: err instanceof Error ? err.message : 'Write failed.' }
  }
}
