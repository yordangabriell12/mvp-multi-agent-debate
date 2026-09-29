// The user list: accounts, roles and password hashes.
//
// Replaces the single credentials pair that used to live in the environment.
// The environment is still honoured, so an existing deployment keeps working and
// its owner does not get locked out; see ensureBootstrapAdmin.

import { randomBytes, randomUUID } from 'node:crypto'
import { hashPassword, verifyPassword, type SessionPayload } from '@/lib/auth'
import { readSecureFile, writeSecureFile } from '@/lib/secureFile'

const FILE_NAME = 'users'
const MIN_PASSWORD_LENGTH = 8

export type Role = 'admin' | 'user'
export interface User {
  id: string
  email: string
  name: string
  role: Role
  /** PBKDF2 hash. Never leaves the server. */
  passwordHash: string
  /** True until the owner replaces the password they were handed. */
  mustChangePassword: boolean
  createdAt: number
  updatedAt: number
  /** Last successful sign-in, for the admin list. */
  lastLoginAt?: number
}

/** The shape sent to clients. Note the absence of passwordHash. */
export interface PublicUser {
  id: string
  email: string
  name: string
  role: Role
  mustChangePassword: boolean
  createdAt: number
  lastLoginAt?: number
}

export interface UserStore {
  version: 1
  users: User[]
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  }
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * The claims a session carries for an account.
 *
 * Built in one place so signing in and replacing a password cannot drift apart
 * and issue cookies that disagree about roles or the password flag.
 */
export function sessionClaimsFor(user: User): Omit<SessionPayload, 'iat' | 'exp'> {
  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    // Only set while the password still needs replacing, so a normal account
    // does not carry the flag around.
    pwd: user.mustChangePassword || undefined,
  }
}

async function load(): Promise<{ store: UserStore; error?: string }> {
  const result = await readSecureFile<UserStore>(FILE_NAME)
  if (result.error) return { store: { version: 1, users: [] }, error: result.error }
  if (!result.data || !Array.isArray(result.data.users)) {
    return { store: { version: 1, users: [] } }
  }
  return { store: { version: 1, users: result.data.users } }
}

async function save(store: UserStore): Promise<{ ok: boolean; error?: string }> {
  const result = await writeSecureFile(FILE_NAME, store)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

/**
 * Reads the configured bootstrap admin from the environment.
 *
 * The previous single-account setup kept these in VMA_AUTH_EMAIL and
 * VMA_AUTH_PASSWORD_HASH. Honouring them means an existing deployment does not
 * lose access the moment user accounts are introduced.
 */
export function bootstrapAdmin(): { email: string; passwordHash: string } | null {
  const email = normaliseEmail(process.env.VMA_AUTH_EMAIL || '')
  const passwordHash = process.env.VMA_AUTH_PASSWORD_HASH || process.env.VMA_AUTH_PASSWORD || ''
  if (!email || !passwordHash) return null
  return { email, passwordHash }
}

/**
 * Creates the first admin if the user list is empty, adopting the environment
 * credentials into the store so there is exactly one place that answers "who can
 * sign in" from then on.
 */
export async function ensureBootstrapAdmin(): Promise<{ created: boolean; error?: string }> {
  const { store, error } = await load()
  if (error) return { created: false, error }
  if (store.users.length > 0) return { created: false }

  const seed = bootstrapAdmin()
  if (!seed) return { created: false, error: 'No admin account and no environment credentials.' }

  const now = Date.now()
  const isHashed =
    seed.passwordHash.startsWith('pbkdf2:') || seed.passwordHash.startsWith('pbkdf2$')

  store.users.push({
    id: `user-${randomUUID()}`,
    email: seed.email,
    name: 'Administrator',
    role: 'admin',
    // A plaintext VMA_AUTH_PASSWORD is hashed properly on the way in, so it is
    // never written to disk in the clear.
    passwordHash: isHashed ? seed.passwordHash : await hashPassword(seed.passwordHash),
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
  })

  const saved = await save(store)
  return saved.ok ? { created: true } : { created: false, error: saved.error }
}

/**
 * A well-formed hash of an unguessable value, used to spend the same time on an
 * unknown email as on a known one. Without it, response time reveals whether an
 * address has an account.
 */
const DUMMY_HASH =
  'pbkdf2:210000:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

export async function authenticate(email: string, password: string): Promise<User | null> {
  await ensureBootstrapAdmin()

  const { store } = await load()
  const target = normaliseEmail(email)
  const user = store.users.find((u) => u.email === target)

  if (!user) {
    await verifyPassword(password, DUMMY_HASH)
    return null
  }

  return (await verifyPassword(password, user.passwordHash)) ? user : null
}

export async function findByEmail(email: string): Promise<User | null> {
  const { store } = await load()
  const target = normaliseEmail(email)
  return store.users.find((u) => u.email === target) ?? null
}

export async function findById(id: string): Promise<User | null> {
  const { store } = await load()
  return store.users.find((u) => u.id === id) ?? null
}

/** Generates a readable password. Avoids characters that are easy to misread. */
export function generatePassword(length = 16): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

export interface CreateUserInput {
  email: string
  name?: string
  role?: Role
  /** Omit to have one generated. The generated value is returned once. */
  password?: string
}

export interface CreateUserResult {
  ok: boolean
  user?: PublicUser
  /** Only present when the password was generated rather than supplied. */
  generatedPassword?: string
  error?: string
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const email = normaliseEmail(input.email)
  if (!email || !email.includes('@')) return { ok: false, error: 'A valid email is required.' }

  const { store, error } = await load()
  if (error) return { ok: false, error }

  if (store.users.some((u) => u.email === email)) {
    return { ok: false, error: 'That email already has an account.' }
  }

  const generated = input.password ? undefined : generatePassword()
  const plainPassword = input.password || generated || ''
  if (plainPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  const now = Date.now()
  const user: User = {
    id: `user-${randomUUID()}`,
    email,
    name: (input.name || '').trim() || email.split('@')[0],
    role: input.role === 'admin' ? 'admin' : 'user',
    passwordHash: await hashPassword(plainPassword),
    // The account starts with a password someone else chose and handed over, so
    // it must be replaced before the account is used in earnest.
    mustChangePassword: true,
    createdAt: now,
    updatedAt: now,
  }

  store.users.push(user)
  const saved = await save(store)
  if (!saved.ok) return { ok: false, error: saved.error }

  return { ok: true, user: toPublicUser(user), generatedPassword: generated }
}

export async function setPassword(
  userId: string,
  newPassword: string,
  options: { mustChangePassword: boolean }
): Promise<{ ok: boolean; error?: string }> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  const { store, error } = await load()
  if (error) return { ok: false, error }

  const user = store.users.find((u) => u.id === userId)
  if (!user) return { ok: false, error: 'Account not found.' }

  user.passwordHash = await hashPassword(newPassword)
  user.mustChangePassword = options.mustChangePassword
  user.updatedAt = Date.now()

  const saved = await save(store)
  return saved.ok ? { ok: true } : { ok: false, error: saved.error }
}

/**
 * Removes an account, refusing the two cases that would lock the owner out:
 * deleting yourself, and deleting the last remaining admin.
 */
export async function deleteUser(
  userId: string,
  actingUserId: string
): Promise<{ ok: boolean; error?: string }> {
  if (userId === actingUserId) {
    return { ok: false, error: 'You cannot delete your own account.' }
  }

  const { store, error } = await load()
  if (error) return { ok: false, error }

  const user = store.users.find((u) => u.id === userId)
  if (!user) return { ok: false, error: 'Account not found.' }

  if (user.role === 'admin' && store.users.filter((u) => u.role === 'admin').length <= 1) {
    return { ok: false, error: 'This is the last admin account, so it cannot be deleted.' }
  }

  store.users = store.users.filter((u) => u.id !== userId)
  const saved = await save(store)
  return saved.ok ? { ok: true } : { ok: false, error: saved.error }
}

/**
 * Promotes or demotes an account, refusing the one change that would lock the
 * owner out: demoting the last remaining admin.
 */
export async function setRole(
  userId: string,
  role: Role
): Promise<{ ok: boolean; user?: PublicUser; error?: string }> {
  const { store, error } = await load()
  if (error) return { ok: false, error }

  const user = store.users.find((u) => u.id === userId)
  if (!user) return { ok: false, error: 'Account not found.' }

  if (user.role === 'admin' && role !== 'admin') {
    if (store.users.filter((u) => u.role === 'admin').length <= 1) {
      return { ok: false, error: 'This is the last admin, so it cannot be demoted.' }
    }
  }

  user.role = role
  user.updatedAt = Date.now()

  const saved = await save(store)
  return saved.ok ? { ok: true, user: toPublicUser(user) } : { ok: false, error: saved.error }
}

export async function touchLogin(userId: string): Promise<void> {
  const { store } = await load()
  const user = store.users.find((u) => u.id === userId)
  if (!user) return
  user.lastLoginAt = Date.now()
  await save(store)
}

export async function listUsers(): Promise<PublicUser[]> {
  await ensureBootstrapAdmin()
  const { store } = await load()
  return store.users
    .slice()
    // Admins first, then oldest account first, so the list has a stable order.
    .sort((a, b) => (a.role === b.role ? a.createdAt - b.createdAt : a.role === 'admin' ? -1 : 1))
    .map(toPublicUser)
}

export async function countAdmins(): Promise<number> {
  const { store } = await load()
  return store.users.filter((u) => u.role === 'admin').length
}

/**
 * Re-checks a specific account's password.
 *
 * Used by the password change screen, which has a valid session but must still
 * prove the holder knows the password they were given.
 */
export async function verifyAccountPassword(userId: string, password: string): Promise<boolean> {
  const user = await findById(userId)
  if (!user) return false
  return verifyPassword(password, user.passwordHash)
}



