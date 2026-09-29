// Resolves a provider and its API key from the signed-in account's own
// configuration, on the server.
//
// Before this existed, `/api/chat`, `/api/improve` and `/api/providers/models`
// were handed a `providers` array by the browser, complete with API keys. That
// meant the keys had to be sent to the browser in the first place, so they were
// readable by anyone with the page open. Routes now receive only a provider id
// and read the key here instead.
//
// Two things follow from that, and both are deliberate:
//
//   - A user who cannot see the keys cannot submit a modified one, so rotating
//     or correcting a key happens in one place.
//   - The base URL is now server-held rather than request-supplied, so it is no
//     longer attacker-controlled. The outbound check still runs, because a
//     configuration can be edited and a stored value should never be trusted
//     just because it was stored.

import type { ProviderConfig } from '@/types/provider'
import { checkOutboundUrlDeep } from '@/lib/netGuard'
import { readConfig } from '@/lib/serverStore'

/** The subset of a stored configuration this module reads. */
interface StoredConfig {
  providers?: ProviderConfig[]
}

export type ResolveResult =
  | { ok: true; provider: ProviderConfig }
  | { ok: false; status: number; error: string }

/**
 * Reads one account's configuration with keys intact.
 *
 * `keepKeys` is always true here: this module exists to put the key on the
 * request that reaches the provider, and it runs only on the server. What the
 * browser receives is decided by the route, not by this call.
 */
async function readAccountConfig(userId: string): Promise<StoredConfig | null> {
  const { config } = await readConfig(userId, { keepKeys: true })
  return config as StoredConfig | null
}

/**
 * The provider with the given id from this account's configuration, with its
 * key attached.
 *
 * The error messages are deliberately specific: "no key set for OpenAI" tells
 * the account holder what to fix, and this value came from their own
 * configuration, so there is nothing secret in saying so.
 */
export async function resolveProvider(
  userId: string,
  providerId: string
): Promise<ResolveResult> {
  const id = String(providerId ?? '').trim()
  if (!id) return { ok: false, status: 400, error: 'No provider was specified.' }

  const config = await readAccountConfig(userId)
  const providers = config?.providers

  if (!Array.isArray(providers) || providers.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'No providers are configured yet. An administrator can add one under API Keys.',
    }
  }

  const provider = providers.find((p) => p?.id === id)
  if (!provider) {
    return { ok: false, status: 400, error: `Unknown provider: ${id}` }
  }

  // An empty key is a normal state, not an error: it means the administrator has
  // not filled this provider in yet. The caller reports it as "unavailable"
  // rather than failing, so the model list can simply come back empty.
  if (!provider.apiKey) {
    return {
      ok: false,
      status: 400,
      error: `No API key is set for ${provider.name || id}.`,
    }
  }

  if (process.env.VMA_ALLOW_PRIVATE_BASEURL !== 'true') {
    const guard = await checkOutboundUrlDeep(provider.baseUrl)
    if (!guard.ok) return { ok: false, status: 400, error: guard.reason || 'Base URL rejected.' }
  }

  return { ok: true, provider }
}

/**
 * Every configured provider that has a usable key, key attached.
 *
 * Used where the server needs to pick a provider itself rather than being told
 * which one, for example falling back for the moderator.
 */
export async function resolveProvidersWithKeys(userId: string): Promise<ProviderConfig[]> {
  const config = await readAccountConfig(userId)
  if (!Array.isArray(config?.providers)) return []
  return config.providers.filter((p) => p?.apiKey)
}
