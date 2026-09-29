import { create } from 'zustand'
import {
  type StoredDocument,
  saveDocument as dbSave,
  getDocuments as dbGetAll,
  deleteDocument as dbDelete,
} from '@/lib/db'
import { extractFileText } from '@/lib/fileInput'
import { generateId } from '@/lib/utils'

interface DocumentState {
  documents: StoredDocument[]
  loading: boolean
  loadDocuments: () => Promise<void>
  /**
   * Reads a file and stores its text.
   *
   * Returns null when the file could not be turned into text, having recorded the
   * reason in `lastError`. Storing the bytes instead, as this used to do, meant a
   * PDF became page after page of binary noise in every agent's prompt.
   */
  uploadFile: (file: File, agentId?: string) => Promise<StoredDocument | null>
  removeDocument: (id: string) => Promise<void>
  /** Why the last upload failed, for the UI to show and then clear. */
  lastError: string | null
  lastWarning: string | null
  clearMessages: () => void
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documents: [],
  loading: false,
  lastError: null,
  lastWarning: null,

  loadDocuments: async () => {
    set({ loading: true })
    try {
      const docs = await dbGetAll()
      set({ documents: docs, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  uploadFile: async (file: File, agentId?: string) => {
    let extracted
    try {
      extracted = await extractFileText(file)
    } catch (error) {
      set({
        lastError: error instanceof Error ? error.message : 'Could not read that file.',
        lastWarning: null,
      })
      return null
    }

    const doc: StoredDocument = {
      id: `doc-${generateId()}`,
      name: file.name,
      type: file.type,
      size: file.size,
      content: extracted.text,
      agentId,
      createdAt: Date.now(),
    }

    try {
      await dbSave(doc)
    } catch {
      set({ lastError: 'Browser storage is full, so that file was not saved.', lastWarning: null })
      return null
    }

    set((state) => ({
      documents: [...state.documents, doc],
      lastError: null,
      lastWarning: extracted.warning ?? null,
    }))
    return doc
  },

  removeDocument: async (id: string) => {
    await dbDelete(id)
    set((state) => ({ documents: state.documents.filter((d) => d.id !== id) }))
  },

  clearMessages: () => set({ lastError: null, lastWarning: null }),
}))
