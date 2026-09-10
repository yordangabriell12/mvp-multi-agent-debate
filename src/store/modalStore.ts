import { create } from 'zustand'

export type ModalId = 'apiKeys' | 'agents' | 'models' | 'roles' | 'documents' | 'newSession' | null

interface ModalState {
  activeModal: ModalId
  openModal: (id: ModalId) => void
  closeModal: () => void
}

export const useModalStore = create<ModalState>((set) => ({
  activeModal: null,
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
}))