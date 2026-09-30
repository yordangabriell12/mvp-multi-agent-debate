import { openDB, type IDBPDatabase } from 'idb'

export interface StoredDocument {
  id: string
  name: string
  type: string
  size: number
  content: string
  agentId?: string
  createdAt: number
  /**
   * A downscaled preview of an image, so the conversation can show what was attached.
   *
   * Kept here, where the document already lives, rather than only on the message: the
   * document list and the message both need it, and rebuilding it would mean holding
   * the original File, which is gone once the upload finishes.
   */
  thumbnail?: string
  /** Pixels of the original, when it could be read. */
  width?: number
  height?: number
  /** How the text was obtained, for the label beside the file. */
  method?: 'text' | 'pdf-text' | 'pdf-vision' | 'image-vision'
  viaOcr?: boolean
  warning?: string
}

const DB_NAME = 'vma-documents'
const DB_VERSION = 2
const STORE_NAME = 'files'

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, _oldVer, _newVer, tx) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('agentId', 'agentId')
      } else if (_oldVer < 2) {
        const store = tx.objectStore(STORE_NAME)
        if (!store.indexNames.contains('agentId')) {
          store.createIndex('agentId', 'agentId')
        }
      }
    },
  })
}

export async function saveDocument(doc: StoredDocument): Promise<void> {
  const db = await getDB()
  await db.put(STORE_NAME, doc)
}

export async function getDocuments(agentId?: string): Promise<StoredDocument[]> {
  const db = await getDB()
  if (agentId) {
    const index = db.transaction(STORE_NAME).store.index('agentId')
    return index.getAll(agentId)
  }
  return db.getAll(STORE_NAME)
}

export async function getDocument(id: string): Promise<StoredDocument | undefined> {
  const db = await getDB()
  return db.get(STORE_NAME, id)
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE_NAME, id)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}