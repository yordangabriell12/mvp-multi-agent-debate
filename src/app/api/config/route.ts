import { NextResponse } from 'next/server'
import { adoptLegacyConfig, readConfig, writeConfig } from '@/lib/serverStore'
import { ensureBootstrapAdmin } from '@/lib/users'
import { getCurrentUser } from '@/lib/session'
import type { ProviderConfig } from '@/types/provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// This route sits behind the auth proxy: only a signed-in session can reach it,
// and the configuration it returns belongs to that session's account.
//
// The response always carries no-store. It is authenticated JSON, so no proxy,
// CDN or browser should ever keep a copy: a cached response could otherwise be
// served to a request that is no longer signed in.
const NO_STORE = { 'Cache-Control': 'no-store, private, max-age=0' }

interface StoredConfig {
  providers?: ProviderConfig[]
  moderator?: { providerId: string; modelId: string }
  agents?: unknown
  sessions?: unknown
  activeSessionId?: string | null
  messages?: unknown
  /** The first-run walkthrough has been completed or dismissed. */
  tourSeen?: boolean
}

/**
 * The account's own configuration.
 *
 * `keepKeys` is true only for an admin. Everyone else is sent the same shape with
 * the keys already removed and `hasKey` set in their place, which is done in
 * `readConfig` so the two callers here cannot disagree about it.
 */
export async function GET() {
  await ensureBootstrapAdmin()

  const account = await getCurrentUser()
  if (!account) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  const isAdmin = account.role === 'admin'

  // A deployment that predates accounts had one shared configuration file. The
  // first admin here claims it, so their providers and keys are not lost.
  if (isAdmin) await adoptLegacyConfig(account.id)

  const result = await readConfig(account.id, { keepKeys: isAdmin })
  if (result.error) {
    return NextResponse.json(
      { config: null, updatedAt: null, warning: result.error },
      { headers: NO_STORE }
    )
  }

  return NextResponse.json({ config: result.config, updatedAt: result.updatedAt }, { headers: NO_STORE })
}

export async function PUT(req: Request) {
  const account = await getCurrentUser()
  if (!account) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Expected a configuration object' }, { status: 400, headers: NO_STORE })
  }

  const incoming = body as StoredConfig

  // A non-admin's client received providers with the keys stripped, so writing
  // its version back would erase the keys the server actually holds. Only the
  // admin, who owns the provider list, may change it.
  const result = await writeConfig(account.id, {
    canWriteProviders: account.role === 'admin',
    providers: Array.isArray(incoming.providers) ? incoming.providers : undefined,
    moderator: incoming.moderator,
    agents: incoming.agents,
    sessions: incoming.sessions,
    activeSessionId: incoming.activeSessionId,
    messages: incoming.messages,
    tourSeen: incoming.tourSeen,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE })
  }
  return NextResponse.json({ ok: true, updatedAt: result.updatedAt }, { headers: NO_STORE })
}
