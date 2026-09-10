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

function applyConfig(config: Partial<SyncPayload>): void {
  if (config.providers && Array.isArray(config.providers) && config.providers.length > 0) {
    useSettingsStore.setState({ providers: config.providers as never })
    safeSetItem(STORAGE_KEYS.providers, JSON.stringify(config.providers))
  }

  if (config.moderator) {
    const { providerId, modelId } = config.moderator
    useSettingsStore.setState({ moderatorProviderId: providerId, moderatorModelId: modelId })
    safeSetItem(STORAGE_KEYS.moderator, JSON.stringify(config.moderator))
  }

  if (config.agents && Array.isArray(config.agents) && config.agents.length > 0) {
    useAgentStore.setState({ agents: config.agents as never })
    safeSetItem(STORAGE_KEYS.agents, JSON.stringify(config.agents))
  }

  if (config.sessions && Array.isArray(config.sessions)) {
    const activeSessionId =
      config.activeSessionId && config.sessions.some((s: { id?: string }) => s?.id === config.activeSessionId)
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
}

export async function loadRemoteConfig(): Promise<void> {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' })
    if (!res.ok) return

    const data = await res.json()
    if (data?.warning) console.warn('Config store warning:', data.warning)
    if (!data?.config) {
      // First run on a fresh server: seed it from whatever is already local.
      scheduleConfigPush()
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

  void loadRemoteConfig()
}
