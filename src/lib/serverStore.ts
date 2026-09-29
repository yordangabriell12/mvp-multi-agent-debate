// Server-side storage for configuration, split by who owns what.
//
//   shared            the provider list. It holds API keys and belongs to the
//                     admin, so it is one file for the whole deployment.
//   workspace-<id>    one file per account: its moderator choice, agents,
//                     sessions and messages. Separate files are what keep a new
//                     account's chat empty instead of inheriting someone else's.
//
// A non-admin never receives a key. `providersFor` replaces it with `hasKey`, so
// the UI can still tell a configured provider from an empty one without the
// browser ever holding the secret.
//
// Both files go through `secureFile`, so they are encrypted at rest and written
// atomically.

import {
  readSecureFile,
  retireSecureFile,
  writeSecureFile,
  MAX_PAYLOAD_BYTES,
} from '@/lib/secureFile'
import { PRESET_PROVIDERS, type ProviderConfig } from '@/types/provider'
import { normaliseOcrSettings, type OcrSettings } from '@/types/ocr'

const SHARED_FILE = 'shared'
/** The name used before accounts existed, holding one configuration for all. */
const LEGACY_FILE = 'config'

/** Refuse payloads beyond this. Persisted configuration only, not file storage. */
export const MAX_CONFIG_BYTES = MAX_PAYLOAD_BYTES

/** Account ids are generated server-side, but never trust one as a file name. */
function workspaceFileName(userId: string): string {
  return `workspace-${userId.replace(/[^a-zA-Z0-9-]/g, '')}`
}

export interface StoredConfig {
  providers?: ProviderConfig[]
  moderator?: { providerId: string; modelId: string }
  agents?: unknown
  sessions?: unknown
  activeSessionId?: string | null
  messages?: unknown
  /** The first-run walkthrough has been completed or dismissed. */
  tourSeen?: boolean
}

export interface ConfigWriteResult {
  ok: boolean
  updatedAt?: number
  error?: string
}

// --- Shared provider store --------------------------------------------------

/**
 * The list a deployment starts with: the built-in providers, with no keys.
 *
 * These are only base URLs and model names, no secrets. Without them a fresh
 * deployment would show an empty API Keys screen with nothing to fill in, and the
 * user would have to type a base URL from memory to get started.
 */
function defaultProviders(): ProviderConfig[] {
  return PRESET_PROVIDERS.map((p) => ({ ...p, apiKey: '' }))
}

/** What is actually stored. Empty means nothing has been saved yet. */
async function readSharedFile(): Promise<{ providers?: ProviderConfig[]; ocr?: unknown }> {
  const result = await readSecureFile<{ providers?: ProviderConfig[]; ocr?: unknown }>(SHARED_FILE)
  return result.data ?? {}
}

async function readSharedProviders(): Promise<ProviderConfig[]> {
  const data = await readSharedFile()
  return Array.isArray(data.providers) ? data.providers : []
}

/**
 * The OCR settings, for the super admin's screen.
 *
 * Read from the same shared file as the providers, because both belong to the
 * same owner and both must be invisible to a normal account. Nothing here is a
 * secret on its own, but it is only writable by the super admin.
 */
export async function readOcrSettings(): Promise<OcrSettings> {
  const data = await readSharedFile()
  return normaliseOcrSettings(data.ocr)
}

/** Replaces the stored OCR settings. Admin-only, enforced by the route. */
export async function writeOcrSettings(settings: OcrSettings): Promise<ConfigWriteResult> {
  const data = await readSharedFile()
  const result = await writeSecureFile(SHARED_FILE, { ...data, ocr: normaliseOcrSettings(settings) })
  return result.ok ? { ok: true, updatedAt: result.updatedAt } : { ok: false, error: result.error }
}

/**
 * The provider list with keys intact. Server-side only: `/api/chat` and the
 * model probe use this to reach the provider on the account's behalf.
 */
export async function readProviders(): Promise<ProviderConfig[]> {
  const stored = await readSharedProviders()
  return stored.length > 0 ? stored : defaultProviders()
}

/** Replaces the shared provider list. Admin-only, enforced by the route. */
export async function writeProviders(providers: ProviderConfig[]): Promise<ConfigWriteResult> {
  // Merged rather than overwritten: the same file also holds the OCR settings,
  // and writing `{ providers }` alone would silently drop them every time an
  // admin saved a key.
  const data = await readSharedFile()
  const result = await writeSecureFile(SHARED_FILE, { ...data, providers })
  return result.ok ? { ok: true, updatedAt: result.updatedAt } : { ok: false, error: result.error }
}

/**
 * Prepares one provider for a client.
 *
 * `keepKeys` is true for admins: they own the keys, and the settings screen has
 * to be able to edit them.
 *
 * `hasKey` is always set, for admins too, even though their `apiKey` already
 * answers the same question. A field that is sometimes present and sometimes not
 * forces every caller to know which kind of account it is holding, and that is
 * exactly the knowledge the client should not need: it can ask whether a key
 * exists without knowing who is looking. The admin's own key being visible is a
 * property of `apiKey`, not of `hasKey`.
 */
export function providersFor(providers: ProviderConfig[], keepKeys: boolean): ProviderConfig[] {
  return providers.map((p) => ({
    ...p,
    apiKey: keepKeys ? p.apiKey : '',
    hasKey: Boolean(p.apiKey),
  }))
}

// --- Per-account workspace --------------------------------------------------

async function readWorkspace(userId: string): Promise<{ config: unknown | null; error?: string }> {
  const result = await readSecureFile<unknown>(workspaceFileName(userId))
  return { config: result.data, error: result.error }
}

/**
 * Reads one account's configuration.
 *
 * The provider list comes from the shared store, because that is where it lives;
 * the rest comes from the account's own workspace file. Merging them here means
 * every caller sees a single configuration object, as before accounts existed.
 */
export async function readConfig(
  userId: string,
  options: { keepKeys: boolean }
): Promise<{ config: unknown | null; updatedAt: number | null; error?: string }> {
  const workspace = await readWorkspace(userId)
  const providers = providersFor(await readProviders(), options.keepKeys)

  // A brand new account has no workspace file yet. Reporting `null` would make
  // the client seed the server from whatever is in its own localStorage, which
  // for a fresh browser is nothing.
  //
  // The empty conversations are sent explicitly rather than omitted. The client
  // applies a server value only when it is present, so an omitted `sessions`
  // means "leave what is there", not "there are none". On a shared machine that
  // would leave the previous account's conversations on screen for the new one.
  //
  // `agents` is the one field deliberately left out, and the reason is the
  // opposite: an account with no agents of its own should keep the default panel,
  // so the workspace is usable the moment it opens. Omitting it lets the client
  // fall back to those defaults instead of overwriting them with nothing.
  const stored = (workspace.config as StoredConfig | null) ?? {}

  return {
    config: {
      ...stored,
      providers,
      ...(Array.isArray(stored.agents) ? { agents: stored.agents } : {}),
      sessions: Array.isArray(stored.sessions) ? stored.sessions : [],
      messages: stored.messages && typeof stored.messages === 'object' ? stored.messages : {},
      activeSessionId: stored.activeSessionId ?? null,
    },
    updatedAt: null,
    error: workspace.error,
  }
}

export interface SaveInput {
  /** True for admins: only they may change the shared provider list. */
  canWriteProviders: boolean
  /**
   * Providers as the client sees them. For an admin this is the real list. For
   * everyone else it arrived with keys stripped, so it is ignored rather than
   * written back over the keys the server holds.
   */
  providers?: ProviderConfig[]
  moderator?: StoredConfig['moderator']
  agents?: unknown
  sessions?: unknown
  activeSessionId?: string | null
  messages?: unknown
  tourSeen?: boolean
}

export async function writeConfig(userId: string, input: SaveInput): Promise<ConfigWriteResult> {
  if (input.canWriteProviders && Array.isArray(input.providers)) {
    const saved = await writeProviders(input.providers)
    if (!saved.ok) return saved
  }

  // Only known keys are carried over, so an extra field in the request body
  // cannot end up persisted.
  const workspace: StoredConfig = {
    moderator: input.moderator,
    agents: input.agents,
    sessions: input.sessions,
    activeSessionId: input.activeSessionId,
    messages: input.messages,
    tourSeen: input.tourSeen,
  }

  const result = await writeSecureFile(workspaceFileName(userId), workspace)
  return result.ok ? { ok: true, updatedAt: result.updatedAt } : { ok: false, error: result.error }
}

export async function markTourSeen(userId: string): Promise<ConfigWriteResult> {
  const { config } = await readWorkspace(userId)
  const stored = (config as StoredConfig | null) ?? {}
  const result = await writeSecureFile(workspaceFileName(userId), { ...stored, tourSeen: true })
  return result.ok ? { ok: true, updatedAt: result.updatedAt } : { ok: false, error: result.error }
}

/**
 * Hands the single pre-accounts configuration to the first admin, once.
 *
 * Before accounts existed there was one file for the whole deployment, written
 * by whoever signed in. Its provider list becomes the shared store, and the rest
 * (agents, sessions, messages) becomes that admin's workspace, so nothing is
 * lost on the upgrade. The old file is renamed aside afterwards, which is what
 * makes this run once.
 */
export async function adoptLegacyConfig(userId: string): Promise<boolean> {
  const legacy = await readSecureFile<StoredConfig>(LEGACY_FILE)
  if (!legacy.data) return false

  const existing = await readSharedProviders()

  // A shared provider list already present means the split has happened, so
  // there is nothing to move; the legacy file is simply retired.
  let adopted = false
  if (existing.length === 0) {
    const { providers, ...workspace } = legacy.data
    if (Array.isArray(providers) && providers.length > 0) await writeProviders(providers)
    if (Object.keys(workspace).length > 0) {
      await writeSecureFile(workspaceFileName(userId), workspace)
    }
    adopted = true
  }

  // Moving the file aside is what makes this run once.
  await retireSecureFile(LEGACY_FILE)
  return adopted
}
