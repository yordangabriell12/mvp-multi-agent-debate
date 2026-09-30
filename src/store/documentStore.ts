import { create } from 'zustand'
import {
  type StoredDocument,
  saveDocument as dbSave,
  getDocuments as dbGetAll,
  deleteDocument as dbDelete,
} from '@/lib/db'
import { extractFileText, type ExtractedFile } from '@/lib/fileInput'
import { buildFilePreview } from '@/lib/filePreview'
import { generateId } from '@/lib/utils'

interface DocumentState {
  documents: StoredDocument[]
  loading: boolean
  loadDocuments: () => Promise<void>
  /**
   * Reads a file and stores it.
   *
   * A file whose text cannot be read is still stored, with an empty `content` and a
   * warning saying why. This used to be a hard failure that returned null, which meant an
   * image or a scanned PDF could not be attached at all when no vision model was set up:
   * the reader pressed upload, got an error, and never saw the file. Seeing the file and
   * being told it cannot be read is more useful than not seeing it, and it is the only one
   * of the two that lets the reader ask someone else about the contents.
   *
   * `agentId` scopes a document to one agent. Without it the file is shared with the room.
   */
  uploadFile: (file: File, agentId?: string) => Promise<StoredDocument | null>
  removeDocument: (id: string) => Promise<void>
  /** Why the last upload failed, for the UI to show and then clear. */
  lastError: string | null
  lastWarning: string | null
  clearMessages: () => void
}

/**
 * Builds the record for a file whose text could not be read.
 *
 * The preview is rebuilt here because reading the text is where the file was consumed, and
 * without it an unreadable image would show up as a bare filename with a generic icon,
 * which is precisely the case where seeing the image matters.
 */
async function describeUnreadable(file: File, reason: string): Promise<StoredDocument> {
  const preview = await buildFilePreview(file)

  return {
    id: `doc-${generateId()}`,
    name: file.name,
    type: file.type,
    size: file.size,
    // Deliberately empty rather than the raw bytes. This document is offered to the agents
    // as reference material, and binary would be page after page of noise in the prompt.
    content: '',
    createdAt: Date.now(),
    thumbnail: preview.thumbnail ?? undefined,
    width: preview.width,
    height: preview.height,
    warning: reason,
  }
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
    let extracted: ExtractedFile
    try {
      extracted = await extractFileText(file)
    } catch (error) {
      // The file is kept even though its text could not be read. Dropping it left the
      // reader with an error and nothing on screen, which for an image or a scan with no
      // vision model configured meant the file could never be attached at all.
      const reason = error instanceof Error ? error.message : 'Could not read that file.'
      const unreadable = await describeUnreadable(file, reason)

      try {
        await dbSave(unreadable)
      } catch {
        set({ lastError: 'Browser storage is full, so that file was not saved.', lastWarning: null })
        return null
      }

      set((state) => ({ documents: [...state.documents, unreadable], lastError: null, lastWarning: reason }))
      return unreadable
    }

    const doc: StoredDocument = {
      id: `doc-${generateId()}`,
      name: file.name,
      type: file.type,
      size: file.size,
      content: extracted.text,
      agentId,
      createdAt: Date.now(),
      // Carried through so the conversation can show what was attached. The text is what
      // the agents read; the preview is what the reader sees, and neither replaces the
      // other.
      thumbnail: extracted.thumbnail ?? undefined,
      width: extracted.width,
      height: extracted.height,
      method: extracted.method,
      viaOcr: extracted.viaOcr,
      warning: extracted.warning,
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
