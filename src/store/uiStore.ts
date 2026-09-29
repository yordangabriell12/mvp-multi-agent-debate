import { create } from 'zustand'

// Small pieces of UI state that come from the server rather than the user.
//
// Currently just the role. It decides whether the admin screens, the API Keys
// entry and the walkthrough's last step appear at all, and it is read in several
// places, so it lives in a store rather than being fetched per component.

interface UiState {
  /** True when the signed-in account owns the provider keys. */
  isAdmin: boolean
  /** False until `/api/me` has answered, so admin controls do not flash. */
  ready: boolean
  setFromAccount: (account: { isAdmin: boolean }) => void
}

export const useUiStore = create<UiState>((set) => ({
  isAdmin: false,
  ready: false,
  setFromAccount: ({ isAdmin }) => set({ isAdmin, ready: true }),
}))
