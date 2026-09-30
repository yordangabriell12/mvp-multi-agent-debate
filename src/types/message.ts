/** How a file's text was obtained, for the label shown beside it. */
export type ReadMethod = 'text' | 'pdf-text' | 'pdf-vision' | 'image-vision'

/**
 * A file attached to a message, as shown in the conversation.
 *
 * Named for what it carries rather than reused from `metadata.attachments`, because
 * that field is optional and every use of it would need a non-null assertion.
 */
export interface MessageAttachment {
  type: string
  name: string
  size: number
  thumbnail?: string
  /** Set when a model read the file rather than its own text layer. */
  viaOcr?: boolean
  method?: ReadMethod
  /** Characters of extracted text handed to the agents. */
  textLength?: number
  width?: number
  height?: number
  warning?: string
}

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'agent' | 'system' | 'moderator' | 'code' | 'browser' | 'ppt' | 'search' | 'ocr' | 'file'
  agentId?: string
  content: string
  attachments?: Attachment[]
  metadata?: {
    model?: string
    tokens?: number
    cost?: number
    duration?: number
    round?: number
    // Extended metadata for new message types
    code?: string           // code block content
    language?: string       // code language
    output?: string         // code execution output
    outputImages?: string[] // base64 images from code output
    url?: string            // browser URL
    screenshot?: string     // browser screenshot (base64)
    html?: string           // HTML preview content
    pptFilename?: string    // PPT file
    pptSlides?: { title: string; content: string }[]
    searchResults?: { title: string; snippet: string; url: string }[]
    searchQuery?: string
    searchSource?: string
    ocrText?: string        // OCR extracted text
    ocrLanguage?: string
    /**
     * Files attached to this message, shown in the conversation.
     *
     * A thumbnail rather than the file itself. Messages are written to localStorage and
     * pushed to the server on every change, so a full-size image here would turn one
     * upload into a multi-megabyte write repeated on each change, and localStorage holds
     * about 5 MB. `textLength` is what tells the reader the file was really read.
     */
    attachments?: {
      type: string
      name: string
      size: number
      thumbnail?: string
      /** Set when a model read the file rather than its own text layer. */
      viaOcr?: boolean
      method?: 'text' | 'pdf-text' | 'pdf-vision' | 'image-vision'
      /** Characters of extracted text handed to the agents. */
      textLength?: number
      width?: number
      height?: number
      warning?: string
    }[]
  }
  createdAt: number
}

export interface Attachment {
  id: string
  name: string
  type: string
  size: number
  url?: string
}