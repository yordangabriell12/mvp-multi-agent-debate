// Reads text out of PDFs and images.
//
// Three inputs, three different jobs:
//
//   A PDF with a text layer   extract the text. No model call, so it is free and
//                             exact. Most documents exported from a word
//                             processor are this.
//   A scanned PDF             no text layer exists, so the page is rendered to a
//                             bitmap and sent to a vision model.
//   An image                  straight to the vision model.
//
// The two PDF paths are decided per document, by looking for a text layer first.
// Sending every page to a vision model would work, but it costs money for
// documents that need no reading at all, and it is less accurate than the text
// that is already there.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import type { OcrSettings } from '@/types/ocr'

/** A page as sent to the client and to the model. */
export interface OcrPage {
  /** 1-based page number, so a citation can point at it. */
  page: number
  text: string
  /** True when the text came from a vision model rather than a text layer. */
  viaVision: boolean
}

export interface OcrResult {
  ok: boolean
  pages: OcrPage[]
  /** 'pdf-text' | 'pdf-vision' | 'image-vision' */
  method?: string
  /** True when pages were left unread because the page limit was reached. */
  truncated?: boolean
  totalPages?: number
  error?: string
}

/**
 * Widest a rendered page is allowed to be, in pixels.
 *
 * A vision model charges by pixels, and a full A4 page rendered at the scale
 * below is more resolution than reading body text needs.
 */
const MAX_RENDER_WIDTH = 1600

/** Loading pdf.js dynamically keeps the browser build away from the Node paths. */
let pdfjsModule: typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null = null

/**
 * Resolves a file inside an installed package, without the bundler seeing it.
 *
 * Two deliberate details:
 *
 *   `createRequire` is reached through `process.getBuiltinModule` rather than
 *   imported. A `require.resolve` whose argument is a variable is a request
 *   webpack cannot analyse, and importing it directly makes the build print
 *   "Critical dependency: the request of a dependency is an expression" on every
 *   run. Going through the built-in module keeps it out of the analyser's view.
 *   pdf.js itself uses this same call for this same reason.
 *
 *   The specifier is assembled at runtime. Written as one literal, webpack reads
 *   it as a dependency and fails the build outright with "ESM packages need to be
 *   imported", because the worker is an ES module that is never imported.
 *
 * A path fallback follows the resolve. `require.resolve` needs the package's own
 * `package.json`, and a standalone output only contains files the bundler traced.
 * Rather than depend on that, the direct path is tried as well.
 */
function resolvePackageFile(pkg: string, subPath: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builtin = (process as any).getBuiltinModule('module') as typeof import('node:module')
  const require = builtin.createRequire(import.meta.url)

  try {
    return require.resolve([pkg, subPath].join('/'))
  } catch {
    // In a standalone build the working directory holds node_modules directly.
    return path.join(process.cwd(), 'node_modules', pkg, subPath)
  }
}

/**
 * Loads pdf.js once and points it at its own worker file.
 *
 * The worker has to be named explicitly. pdf.js looks for `pdf.worker.mjs`
 * relative to its own directory, and the bundler follows the `import` of the main
 * module but not that sibling, so in the standalone build the worker is simply
 * absent and every read fails with "Setting up fake worker failed".
 */
async function loadPdfjs() {
  if (pdfjsModule) return pdfjsModule

  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs')
  mod.GlobalWorkerOptions.workerSrc = resolvePackageFile('pdfjs-dist', 'legacy/build/pdf.worker.mjs')

  pdfjsModule = mod
  return mod
}

/**
 * Where pdf.js finds its fallback fonts.
 *
 * A PDF may reference one of the 14 standard fonts without embedding it, and
 * pdf.js has to draw those from its own copies. Without this it substitutes a
 * default and logs a warning, and a substituted font is a rendering that OCR may
 * misread.
 *
 * Returned as a plain absolute path, not a `file://` URL. The Node build of
 * pdf.js reads the value with `fs.readFile` directly, and a `file://` string is a
 * path that does not exist rather than a URL it would parse.
 */
function standardFontDataPath(): string | undefined {
  try {
    const pkgPath = resolvePackageFile('pdfjs-dist', 'package.json')
    return path.join(path.dirname(pkgPath), 'standard_fonts') + path.sep
  } catch {
    // Missing fonts degrade rendering quality, they do not break reading.
    return undefined
  }
}

/**
 * The document options shared by both read paths.
 *
 * `standardFontDataUrl` is passed to extraction too, not only to rendering. A
 * PDF that references a standard font without embedding it needs that font's
 * character map to turn glyph codes back into text; without it the extraction
 * returns plausible-looking but wrong characters, which is worse than failing.
 */
function documentOptions(buffer: Buffer) {
  return {
    data: new Uint8Array(buffer),
    // The worker would be a second copy of the library. For a short job on the
    // server, running inline is cheaper than shipping and spawning it.
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
    standardFontDataUrl: standardFontDataPath(),
  }
}

interface ExtractedPage {
  page: number
  text: string
}

/**
 * Pulls the text layer out of a PDF, page by page.
 *
 * An empty string means the page has no text layer. That is not an error: it is
 * how a scanned page announces itself, and the caller then decides to render it.
 */
export async function extractPdfText(
  buffer: Buffer,
  maxPages: number
): Promise<{ pages: ExtractedPage[]; totalPages: number }> {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument(documentOptions(buffer)).promise

  const totalPages = doc.numPages
  const limit = Math.min(totalPages, maxPages)
  const pages: ExtractedPage[] = []

  try {
    for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      const content = await page.getTextContent()

      // Fragments are joined with no separator, so a word split across two runs
      // stays one word. Line ends carry their own mark.
      let text = ''
      for (const item of content.items) {
        if ('str' in item) text += item.str
        if ('hasEOL' in item && item.hasEOL) text += '\n'
      }

      pages.push({ page: pageNumber, text: text.replace(/[ \t]+\n/g, '\n').trim() })
      page.cleanup()
    }
  } finally {
    await doc.destroy()
  }

  return { pages, totalPages }
}

/**
 * Renders pages to PNG so a vision model can read them.
 *
 * Only the requested pages are rendered: rasterising a long document to find out
 * that its first page is blank would waste both time and memory.
 */
export async function renderPdfPagesToPng(
  buffer: Buffer,
  pageNumbers: number[]
): Promise<{ page: number; png: Buffer }[]> {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument(documentOptions(buffer)).promise

  const out: { page: number; png: Buffer }[] = []

  try {
    for (const pageNumber of pageNumbers) {
      if (pageNumber < 1 || pageNumber > doc.numPages) continue

      const page = await doc.getPage(pageNumber)
      const unscaled = page.getViewport({ scale: 1 })
      const scale = Math.min(MAX_RENDER_WIDTH / unscaled.width, 3)
      const viewport = page.getViewport({ scale })

      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      const context = canvas.getContext('2d')

      // A white background: a transparent PNG reads as black in some models and
      // the text disappears into it.
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)

      await page.render({
        // The napi-rs canvas is structurally compatible with what pdf.js wants
        // here, but its types are the DOM ones, so the cast is unavoidable.
        canvas: canvas as never,
        canvasContext: context as never,
        viewport,
      }).promise

      out.push({ page: pageNumber, png: canvas.toBuffer('image/png') })
      page.cleanup()
    }
  } finally {
    await doc.destroy()
  }

  return out
}

/**
 * Identifies an image from its leading bytes.
 *
 * The filename cannot be trusted for this: the provider is told a media type and
 * rejects a mismatch, so the decision comes from the bytes themselves.
 */
export function detectImageMime(buffer: Buffer): string {
  // Each signature is checked against the number of bytes it actually needs. A
  // single minimum across all of them would reject a valid short file: a GIF
  // header is six bytes, which is well under the twelve a WEBP check requires.
  if (buffer.length >= 3 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e) {
    return 'image/png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return 'image/gif'
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return 'application/octet-stream'
}

/** The MIME types a vision model accepts from this route. */
export const SUPPORTED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

/** Reads a standalone image file from disk. */
export async function readImageFile(path: string): Promise<{ buffer: Buffer; mime: string }> {
  const buffer = await readFile(path)
  return { buffer, mime: detectImageMime(buffer) }
}

/** True when OCR can run at all: switched on and pointed at a model. */
export function ocrSupportsImages(settings: OcrSettings): boolean {
  return settings.enabled && Boolean(settings.providerId) && Boolean(settings.modelId)
}
