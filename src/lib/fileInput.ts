// Reading a file the user uploaded.
//
// The previous version read every file with `readAsText`, which is right for a
// Markdown note and wrong for everything else. A PDF sent through that comes out
// as page after page of binary noise, and that noise was then put into every
// agent's prompt as reference material: it crowds out the real question and
// produces answers that refer to nothing.
//
// Storage is deliberately left alone. It stays where it was, in the browser, so
// an uploaded document does not start costing server disk. What changes is that
// the text saved is the text of the document rather than its bytes.

import { isReadableByOcr, readFileWithOcr } from '@/lib/ocrClient'
import { buildFilePreview } from '@/lib/filePreview'
import type { ReadMethod } from '@/types/message'

/** Extensions that are plain text and can be read directly. */
const TEXT_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.tsv',
  '.log',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.htm',
  '.sql',
  '.js',
  '.ts',
  '.py',
  '.css',
]

export interface ExtractedFile {
  text: string
  /** Set when the text came from a model reading images, so the UI can say so. */
  viaOcr?: boolean
  /** Anything worth telling the user, such as an unreadable page. */
  warning?: string
  /** A downscaled preview, so the conversation can show what was attached. */
  thumbnail?: string | null
  /** Pixels of the original image, shown beside the preview. */
  width?: number
  height?: number
  /**
   * How the text was obtained, for the label beside the file.
   *
   * Reported from here rather than inferred by the caller, which would otherwise have
   * to know that `viaOcr` being unset means "text file" and not "unknown".
   */
  method?: ReadMethod
}

function isTextFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true
  if (file.type === 'application/json') return true
  const lower = file.name.toLowerCase()
  return TEXT_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/** Reads a file as plain text. */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsText(file)
  })
}

/**
 * Turns an uploaded file into text to store.
 *
 * Three cases, and the order matters: a text file is read directly because there
 * is nothing to extract, a PDF or image goes through OCR, and anything else is
 * refused rather than stored as unreadable bytes.
 *
 * Refusing is the point. A `.docx` read as text would be stored as a wall of
 * binary and silently fed to the agents; a clear "not supported" is more useful
 * than an answer built on noise.
 */
export async function extractFileText(file: File): Promise<ExtractedFile> {
  // Built before anything else, and independently of how the text is read, because a
  // preview is what tells the reader what they attached. A file whose text cannot be
  // read is exactly the case where seeing it matters most.
  const preview = await buildFilePreview(file)

  if (isTextFile(file)) {
    return { text: await readAsText(file), method: 'text', ...preview }
  }

  if (isReadableByOcr(file)) {
    const outcome = await readFileWithOcr(file)

    if (!outcome.ok) {
      // A not-configured answer is a deployment state, not a fault: saying so
      // tells the account holder who to ask.
      throw new Error(
        outcome.notConfigured
          ? 'Reading PDFs and images is not set up yet. A super admin needs to choose a vision model.'
          : outcome.error || 'Could not read that file.'
      )
    }

    if (!outcome.text) {
      throw new Error('No text was found in that file.')
    }

    return {
      text: outcome.text,
      viaOcr: outcome.method !== 'pdf-text',
      warning: outcome.warning,
      method: outcome.method,
      ...preview,
    }
  }

  throw new Error(
    'That file type cannot be read yet. Use a PDF, an image, or a text file such as .txt, .md, .json or .csv.'
  )
}
