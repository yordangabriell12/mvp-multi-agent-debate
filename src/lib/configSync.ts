// Keeps the workspace configuration in step with the server.
//
// Provider entries hold API keys, so they used to live only in this browser and
// were gone the moment you signed in from another machine. The server is now the
// source of truth; localStorage stays as an offline cache.
//
// Stores are not modified to know about this. They are observed with zustand's
// subscribe, which keeps the dependency one-directional and avoids an import
// cycle where a store imports this module and this module imports the store.

import { useSettingsStore } from '@/store/settingsStore'
import { useAgentStore } from '@/store/agentStore'
import { useSessionStore } from '@/store/sessionStore'
import { useChatStore } from '@/store/chatStore'
import { useOnboardingStore } from '@/store/onboardingStore'
import { useUiStore } from '@/store/uiStore'
import { fetchMe } from '@/lib/currentUser'
import { STORAGE_KEYS, safeSetItem, safeGetItem } from '@/lib/storage'

const PUSH_DEBOUNCE_MS = 2500

let started = false
/** Set while applying server data, so hydration does not push straight back. */
let hydrating = false
let pushTimer: ReturnType<typeof setTimeout> | null = null

interface SyncPayload {
  providers: unknown
  moderator: { providerId: string; modelId: string }
  agents: unknown
  sessions: unknown
  activeSessionId: string | null
  messages: unknown
  tourSeen?: boolean
}

function collect(): SyncPayload {
  const settings = useSettingsStore.getState()
  return {
    providers: settings.providers,
    moderator: {
      providerId: settings.moderatorProviderId,
      modelId: settings.moderatorModelId,
    },
    agents: useAgentStore.getState().agents,
    sessions: useSessionStore.getState().sessions,
    activeSessionId: useSessionStore.getState().activeSessionId,
    messages: useChatStore.getState().messages,
    tourSeen: useOnboardingStore.getState().seen,
  }
}

async function pushNow(): Promise<void> {
  try {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collect()),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.warn('Config sync failed:', data?.error || res.status)
    }
  } catch {
    // Offline or server restarting. The next change will retry.
  }
}

function scheduleConfigPush(): void {
  if (hydrating || typeof window === 'undefined') return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushNow()
  }, PUSH_DEBOUNCE_MS)
}

/**
 * Applies a configuration from the server.
 *
 * Every branch assigns unconditionally, including when the server value is
 * missing or empty. That matters for a newly created account: it starts with no
 * sessions and no messages, and if an empty value were skipped the browser would
 * keep showing whatever the last person left in localStorage. The server is the
 * authority on what this account's workspace contains, empty included.
 */
function applyConfig(config: Partial<SyncPayload>): void {
  const providers = Array.isArray(config.providers) ? config.providers : null
  if (providers) {
    useSettingsStore.setState({ providers: providers as never })
    safeSetItem(STORAGE_KEYS.providers, JSON.stringify(providers))
  }

  if (config.moderator) {
    const { providerId, modelId } = config.moderator
    useSettingsStore.setState({ moderatorProviderId: providerId, moderatorModelId: modelId })
    safeSetItem(STORAGE_KEYS.moderator, JSON.stringify(config.moderator))
  }

  const agents = Array.isArray(config.agents) ? config.agents : null
  if (agents) {
    useAgentStore.setState({ agents: agents as never })
    safeSetItem(STORAGE_KEYS.agents, JSON.stringify(agents))
  }

  if (Array.isArray(config.sessions)) {
    const activeSessionId =
      config.activeSessionId &&
      config.sessions.some((s: { id?: string }) => s?.id === config.activeSessionId)
        ? config.activeSessionId
        : ((config.sessions[0] as { id?: string } | undefined)?.id ?? null)
    useSessionStore.setState({ sessions: config.sessions as never, activeSessionId })
    safeSetItem(STORAGE_KEYS.sessions, JSON.stringify(config.sessions))
    if (activeSessionId) safeSetItem(STORAGE_KEYS.activeSession, activeSessionId)
  }

  if (config.messages && typeof config.messages === 'object') {
    useChatStore.setState({ messages: config.messages as never })
    safeSetItem(STORAGE_KEYS.messages, JSON.stringify(config.messages))
  }

  if (typeof config.tourSeen === 'boolean') {
    useOnboardingStore.setState({ seen: config.tourSeen })
  }
}

export async function loadRemoteConfig(): Promise<void> {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' })
    if (!res.ok) return

    const data = await res.json()
    if (data?.warning) console.warn('Config store warning:', data.warning)

    if (!data?.config) {
      // The server has no configuration for this account at all. That is only
      // reachable on a storage failure, because a fresh account gets an empty
      // configuration rather than a null one. Pushing local state up would seed
      // a new account with the previous browser's data, so nothing is pushed;
      // the warning above is the honest report.
      return
    }

    hydrating = true
    applyConfig(data.config as Partial<SyncPayload>)
  } catch {
    // No server or no network: local state remains usable.
  } finally {
    hydrating = false
  }
}

/** True when the server holds a configuration, used to explain the UI state. */
export function hasLocalConfig(): boolean {
  return safeGetItem(STORAGE_KEYS.providers) !== null
}

export function initConfigSync(): void {
  if (started || typeof window === 'undefined') return
  started = true

  useSettingsStore.subscribe(scheduleConfigPush)
  useAgentStore.subscribe(scheduleConfigPush)
  useSessionStore.subscribe(scheduleConfigPush)
  useChatStore.subscribe(scheduleConfigPush)
  useOnboardingStore.subscribe(scheduleConfigPush)

  // The account is fetched first. Its answer decides whether this browser is
  // looking at a real workspace or at leftovers from the previous account, and
  // only then is the configuration pulled.
  void (async () => {
    const me = await fetchMe()
    if (me) {
      useOnboardingStore.getState().hydrate(me.tourSeen)
      useUiStore.getState().setFromAccount({ isAdmin: me.user.isAdmin })
    }
    await loadRemoteConfig()
  })()
}
