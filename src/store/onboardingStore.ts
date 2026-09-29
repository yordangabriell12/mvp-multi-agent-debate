import { create } from 'zustand'
import { STORAGE_KEYS, safeGetItem, safeSetItem } from '@/lib/storage'

// Whether the first-run walkthrough has been seen.
//
// Kept in localStorage as an offline cache and on the server as the source of
// truth. The server copy is what makes the walkthrough appear on a machine the
// account has never used, instead of only on the browser where it was dismissed.

interface OnboardingState {
  /** True once the walkthrough has been finished or dismissed. */
  seen: boolean
  /** True while the walkthrough is on screen. */
  open: boolean
  /** Set once the account has been fetched, so the tour does not flash. */
  ready: boolean

  /** Called when `/api/me` reports the stored value. */
  hydrate: (seen: boolean) => void
  start: () => void
  finish: () => void
}

function loadSeen(): boolean {
  if (typeof window === 'undefined') return false
  return safeGetItem(STORAGE_KEYS.tourSeen) === 'true'
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  seen: loadSeen(),
  open: false,
  ready: false,

  hydrate: (seen) => {
    safeSetItem(STORAGE_KEYS.tourSeen, seen ? 'true' : 'false')
    // A returning account goes straight to the app; a new one is greeted as soon
    // as the account is known, which is the first moment we can tell.
    set({ seen, ready: true, open: !seen })
  },

  start: () => set({ open: true }),
  finish: () => {
    safeSetItem(STORAGE_KEYS.tourSeen, 'true')
    set({ seen: true, open: false })
  },
}))
