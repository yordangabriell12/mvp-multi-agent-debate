import { create } from 'zustand'
import {
  type StoredDocument,
  saveDocument as dbSave,
  getDocuments as dbGetAll,
  deleteDocument as dbDelete,
  readFileAsText,
} from '@/lib/db'
import { generateId } from '@/lib/utils'

interface DocumentState {
  documents: StoredDocument[]
  loading: boolean
  loadDocuments: () => Promise<void>
  uploadFile: (file: File, agentId?: string) => Promise<StoredDocument | null>
  removeDocument: (id: string) => Promise<void>
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documents: [],
  loading: false,

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
    try {
      const content = await readFileAsText(file)
      const doc: StoredDocument = {
        id: `doc-${generateId()}`,
        name: file.name,
        type: file.type,
        size: file.size,
        content,
        agentId,
        createdAt: Date.now(),
      }
      await dbSave(doc)
      set((state) => ({ documents: [...state.documents, doc] }))
      return doc
    } catch {
      return null
    }
  },

  removeDocument: async (id: string) => {
    await dbDelete(id)
    set((state) => ({ documents: state.documents.filter((d) => d.id !== id) }))
  },
}))