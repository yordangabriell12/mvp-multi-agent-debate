// Reads text out of a file through `/api/ocr`.
//
// The client never chooses the model: the server reads that from the super
// admin's OCR settings. So this sends a file and reports what came back, which
// keeps the client honest about the one thing it cannot decide.

export interface OcrPageResult {
  page: number
  text: string
  viaVision: boolean
}

export interface OcrOutcome {
  ok: boolean
  /** The text of every page, in page order. */
  text?: string
  pages?: OcrPageResult[]
  /** 'pdf-text' | 'pdf-vision' | 'image-vision' */
  method?: string
  /** Set when the deployment has no vision model chosen yet. */
  notConfigured?: boolean
  /** Warnings worth showing: skipped pages, unreadable pages, a page limit hit. */
  warning?: string
  error?: string
}

export async function readFileWithOcr(file: File): Promise<OcrOutcome> {
  const form = new FormData()
  form.append('file', file)

  try {
    const res = await fetch('/api/ocr', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || 'Could not read that file.',
        notConfigured: data?.notConfigured === true,
      }
    }

    const pages: OcrPageResult[] = Array.isArray(data?.pages) ? data.pages : []
    const text = pages.map((p) => p.text).join('\n\n').trim()

    return {
      ok: true,
      text,
      pages,
      method: data?.method,
      warning: data?.warning,
    }
  } catch {
    return { ok: false, error: 'Could not reach the server.' }
  }
}

/** True for the file types the OCR route handles. */
export function isReadableByOcr(file: File): boolean {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return true
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)
}
