export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'agent' | 'system' | 'moderator' | 'code' | 'browser' | 'ppt' | 'search' | 'ocr'
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
    attachments?: { type: string; name: string; data: string }[]
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