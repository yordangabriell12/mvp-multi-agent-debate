// Encrypted, atomically written JSON files.
//
// Two stores sit on top of this: the workspace config (which holds provider API
// keys) and the user list (which holds password hashes). Both need the same
// three properties, so they share one implementation:
//
//   1. Encrypted at rest. Each holds a secret, and a copy of the file alone
//      should not be enough to read it.
//   2. Written atomically. Content goes to a temporary file and is renamed over
//      the target, because a process dying mid-write would otherwise leave a
//      truncated file that fails to parse on the next boot.
//   3. Mode 600, in a directory only the app user can read.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * Where the encrypted configuration and user list live.
 *
 * The default is `./data` relative to the working directory, which is correct in the
 * container: `docker-compose.yml` sets `VMA_DATA_DIR=/app/data` on a named volume, so
 * the location is explicit and survives a rebuild.
 *
 * Running the Next.js **standalone** build straight from the project directory is the
 * dangerous case. The process working directory is then `.next/standalone`, and
 * `next build` deletes that whole tree before writing it again. So every build that
 * publishes the app also deletes the accounts and the provider keys sitting inside it,
 * and `npm run build` looks like it merely compiled something. That is a silent data
 * loss, not a crash, which is why it went unnoticed: the accounts simply are not there
 * any more on the next request.
 *
 * This happened for real while checking the admin screen: a rebuild between two
 * requests wiped the user list, and the only symptom was a login that no longer worked.
 */
const DATA_DIR = process.env.VMA_DATA_DIR || path.join(process.cwd(), 'data')

/**
 * True when the store sits somewhere a build will delete.
 *
 * Exported so the rule can be unit-tested without a filesystem: the check is about the
 * shape of the path, not about what is on disk.
 */
export function pathIsInsideBuildOutput(dir: string): boolean {
  return dir.split(path.sep).includes('.next')
}

if (pathIsInsideBuildOutput(DATA_DIR)) {
  // Printed once, at import time, before any file is written. A warning in a log is
  // weak, but it is not silent, and silence is what made this expensive to find.
  console.warn(
    '[vma] VMA_DATA_DIR is not set, so accounts and provider keys are stored inside ' +
    '.next/standalone. A build replaces that directory and deletes them. ' +
    'Set VMA_DATA_DIR to a path outside .next to keep them.'
  )
}

export const DATA_DIRECTORY = DATA_DIR

/** Refuse payloads beyond this. Configuration-scale data, not file storage. */
export const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024

interface Envelope {
  version: 1
  updatedAt: number
  /** iv.tag.ciphertext, each base64url. */
  payload: string
}

export interface ReadResult<T> {
  data: T | null
  updatedAt: number | null
  /** Set when a file exists but cannot be read, so callers can warn rather than fail. */
  error?: string
}

export interface WriteResult {
  ok: boolean
  updatedAt?: number
  error?: string
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

function filePath(name: string): string {
  // Guard against a caller passing a path rather than a name.
  return path.join(DATA_DIR, `${path.basename(name)}.json`)
}

export async function readSecureFile<T>(name: string): Promise<ReadResult<T>> {
  let raw: string
  try {
    raw = await fs.readFile(filePath(name), 'utf8')
  } catch {
    return { data: null, updatedAt: null }
  }

  let envelope: Envelope
  try {
    envelope = JSON.parse(raw)
  } catch {
    return { data: null, updatedAt: null, error: `${name}: stored file is not valid JSON.` }
  }

  const key = encryptionKey()
  if (!key) {
    return { data: null, updatedAt: null, error: `${name}: no encryption key configured.` }
  }

  const plain = decrypt(envelope.payload, key)
  if (plain === null) {
    return {
      data: null,
      updatedAt: null,
      error: `${name}: cannot be decrypted. The encryption key may have changed.`,
    }
  }

  try {
    return { data: JSON.parse(plain) as T, updatedAt: envelope.updatedAt }
  } catch {
    return { data: null, updatedAt: null, error: `${name}: stored content is corrupt.` }
  }
}

/** Moves a file aside so its contents are not read again. Used by migrations. */
export async function retireSecureFile(name: string): Promise<void> {
  const target = filePath(name)
  try {
    await fs.rename(target, `${target}.migrated`)
  } catch {
    // Already gone, or not ours to move. Either way there is nothing to do.
  }
}

/**
 * Moves a legacy file to a new name.
 *
 * Used when a store used to have one shared file and now has one per account:
 * the contents are copied under the new name and the old file is retired, so the
 * same data is never claimed twice.
 */
export async function renameSecureFile(from: string, to: string): Promise<boolean> {
  const source = filePath(from)
  const target = filePath(to)
  try {
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
    // A plain rename would be atomic, but only within one filesystem, and it
    // would clobber an existing target. Copy first, then retire the original.
    await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL)
    await fs.rename(source, `${source}.migrated`)
    return true
  } catch {
    return false
  }
}

export async function writeSecureFile(name: string, data: unknown): Promise<WriteResult> {
  const key = encryptionKey()
  if (!key) {
    return {
      ok: false,
      error: 'No encryption key configured; refusing to store secrets unencrypted.',
    }
  }

  const plain = JSON.stringify(data)
  if (Buffer.byteLength(plain, 'utf8') > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: `Payload exceeds ${MAX_PAYLOAD_BYTES} bytes.` }
  }

  const envelope: Envelope = { version: 1, updatedAt: Date.now(), payload: encrypt(plain, key) }
  const target = filePath(name)
  const temporary = `${target}.${process.pid}.tmp`

  try {
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
    await fs.writeFile(temporary, JSON.stringify(envelope), { mode: 0o600 })
    await fs.rename(temporary, target)
    return { ok: true, updatedAt: envelope.updatedAt }
  } catch (err) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    return { ok: false, error: err instanceof Error ? err.message : 'Write failed.' }
  }
}
