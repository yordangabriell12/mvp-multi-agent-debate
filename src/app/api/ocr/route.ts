// Reads text out of an image or a PDF.
//
// Two things make this route different from `/api/chat`:
//
//   1. It takes a file, not JSON, so it is capped and parsed as multipart.
//   2. The model is chosen by the super admin in settings, not by the caller. A
//      normal account cannot pick the vision model, for the same reason it
//      cannot pick the provider keys: it does not own them.
//
// When no vision model has been configured, the route answers with a clear "not
// configured yet" rather than a provider error, so the upload screen can say
// something true instead of something confusing.

import { checkChatRateLimit } from '@/lib/rateLimit'
import { extractProviderError } from '@/lib/providerError'
import { getCurrentUser } from '@/lib/session'
import { resolveProvider } from '@/lib/providerResolver'
import { readOcrSettings } from '@/lib/serverStore'
import { normaliseOcrSettings, ocrIsConfigured } from '@/types/ocr'
import {
  detectImageMime,
  extractPdfText,
  renderPdfPagesToPng,
  SUPPORTED_IMAGE_MIMES,
  type OcrPage,
} from '@/lib/ocr'
import { checkImageDimensions } from '@/lib/imageSize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, private, max-age=0' }

/** Largest upload accepted. Well above a phone photo, below anything worrying. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...NO_STORE },
  })
}

function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  )
}

/** The instruction sent with every standalone image. Narrow, so the model does not editorialise. */
const OCR_INSTRUCTION = [
  'Transcribe every piece of text in this image, exactly as it appears.',
  'Preserve the reading order and the line breaks.',
  'Render tables as plain text rows, and keep any numbers exactly as written.',
  'Describe a figure, chart or photo in square brackets, on its own line, and only',
  'when it carries information that is not already in the text.',
  'Do not summarise, translate, explain or add commentary.',
  'If the image contains no text at all, reply with exactly: [no text found]',
].join(' ')

const PDF_PAGE_INSTRUCTION = [
  'Transcribe every piece of text on this page of a document, exactly as it appears.',
  'Preserve the reading order, the line breaks and any headings.',
  'Render tables as plain text rows, and keep any numbers exactly as written.',
  'Do not summarise, translate, explain or add commentary.',
  'If the page contains no text at all, reply with exactly: [no text found]',
].join(' ')

interface VisionTarget {
  apiKey: string
  baseUrl: string
  modelId: string
  isAnthropic: boolean
}

/**
 * Asks the vision model to transcribe one image.
 *
 * Returns the result rather than throwing, so one unreadable page does not
 * discard the pages that did read correctly.
 */
async function transcribeImage(
  target: VisionTarget,
  imageBase64: string,
  mimeType: string,
  instruction: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const baseUrl = target.baseUrl.replace(/\/$/, '')

  try {
    if (target.isAnthropic) {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': target.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: target.modelId,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                // The image precedes the instruction: the request is read in
                // order, and the instruction lands better after the thing it
                // refers to.
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mimeType, data: imageBase64 },
                },
                { type: 'text', text: instruction },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(120000),
      })

      if (!res.ok) {
        const detail = await res.text()
        return { ok: false, error: `Provider refused the image: ${extractProviderError(detail)}` }
      }

      const data = await res.json()
      const text = String(data?.content?.[0]?.text ?? '').trim()
      return text ? { ok: true, text } : { ok: false, error: 'No text came back for this image.' }
    }

    // The OpenAI-compatible shape, which is also what OpenRouter, DeepSeek and
    // most self-hosted gateways accept.
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${target.apiKey}`,
      },
      body: JSON.stringify({
        model: target.modelId,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: instruction },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(120000),
    })

    if (!res.ok) {
      const detail = await res.text()
      return { ok: false, error: `Provider refused the image: ${extractProviderError(detail)}` }
    }

    const data = await res.json()
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim()
    return text ? { ok: true, text } : { ok: false, error: 'No text came back for this image.' }
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError'
    return {
      ok: false,
      error: timeout
        ? 'The provider did not answer within two minutes.'
        : `Could not reach the provider: ${error instanceof Error ? error.message : 'unknown'}`,
    }
  }
}

/** Builds the address to call from the settings and the resolved provider. */
function visionTargetFrom(
  provider: { apiKey: string; baseUrl: string; id: string },
  modelId: string
): VisionTarget {
  return {
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    modelId,
    isAnthropic: provider.id === 'anthropic',
  }
}

/**
 * Reads a PDF, using the model only for the pages that need it.
 *
 * Three outcomes, and the difference between them is the point:
 *
 *   every page has text     return that text. No model call, so free and exact.
 *   some pages are scans    return the text, plus the scanned pages read by the
 *                           model, and name any page that could not be read.
 *   no vision model set     return the text and say which pages were skipped,
 *                           rather than returning a shorter document silently.
 */
async function readPdf(buffer: Buffer, settings: ReturnType<typeof normaliseOcrSettings>) {
  let extracted: Awaited<ReturnType<typeof extractPdfText>>
  try {
    extracted = await extractPdfText(buffer, settings.maxPdfPages)
  } catch (error) {
    return jsonResponse(
      {
        error: `Could not read this PDF: ${error instanceof Error ? error.message : 'unknown'}`,
      },
      400
    )
  }

  const byText = extracted.pages
    .filter((p) => p.text.length > 0)
    .map((p) => ({ page: p.page, text: p.text, viaVision: false }))
  const scanned = extracted.pages.filter((p) => p.text.length === 0)
  const truncated = extracted.totalPages > extracted.pages.length

  if (scanned.length === 0) {
    return jsonResponse({
      method: 'pdf-text',
      pages: byText,
      totalPages: extracted.totalPages,
      truncated,
    })
  }

  if (!ocrIsConfigured(settings)) {
    return jsonResponse({
      method: 'pdf-text',
      pages: byText,
      totalPages: extracted.totalPages,
      truncated,
      // Named individually so the UI can say which pages are missing, instead of
      // showing a shorter document with no explanation.
      unreadablePages: scanned.map((p) => p.page),
      warning:
        'Some pages are images rather than text, and no vision model is set up yet. ' +
        'A super admin can choose one under OCR settings.',
    })
  }

  const account = await getCurrentUser()
  if (!account) return jsonResponse({ error: 'Unauthorized' }, 401)

  const resolved = await resolveProvider(account.id, settings.providerId)
  if (!resolved.ok) return jsonResponse({ error: resolved.error }, resolved.status)

  // Only the scanned pages are rendered. Rasterising the whole document to find
  // out that most of it was text would waste both time and memory.
  const rendered = await renderPdfPagesToPng(
    buffer,
    scanned.map((p) => p.page)
  )

  const target = visionTargetFrom(resolved.provider, settings.modelId)
  const viaVision: OcrPage[] = []
  const failures: string[] = []

  for (const { page, png } of rendered) {
    const result = await transcribeImage(target, png.toString('base64'), 'image/png', PDF_PAGE_INSTRUCTION)
    if (result.ok) viaVision.push({ page, text: result.text, viaVision: true })
    else failures.push(`page ${page}: ${result.error}`)
  }

  // Merged back into page order, so "page 4" in a citation still means page 4.
  const pages = [...byText, ...viaVision].sort((a, b) => a.page - b.page)

  return jsonResponse({
    method: 'pdf-vision',
    pages,
    totalPages: extracted.totalPages,
    truncated,
    model: settings.modelId,
    ...(failures.length > 0 ? { warning: failures.join('; ') } : {}),
  })
}

export async function POST(req: Request) {
  const limit = checkChatRateLimit(clientIp(req))
  if (!limit.allowed) {
    return jsonResponse({ error: 'Too many requests. Please slow down.' }, 429)
  }

  const account = await getCurrentUser()
  if (!account) return jsonResponse({ error: 'Unauthorized' }, 401)

  // The model comes from settings, not from the request. A caller cannot choose
  // the vision model any more than it can choose the provider key.
  const settings = normaliseOcrSettings(await readOcrSettings())

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    // A JSON body arrives here as a parse failure, and the default message would
    // be "Invalid JSON body", which is true but useless: the caller sent JSON to a
    // route that wants a file.
    const lookedLikeJson = (req.headers.get('content-type') || '').includes('application/json')
    return jsonResponse(
      {
        error: lookedLikeJson
          ? 'This route takes a file upload, not JSON. Send it as multipart form data with the field named "file".'
          : 'Expected a file upload.',
      },
      lookedLikeJson ? 415 : 400
    )
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return jsonResponse({ error: 'No file was uploaded.' }, 400)
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonResponse(
      { error: `That file is too large. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` },
      413
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const looksLikePdf = buffer.subarray(0, 5).toString('latin1') === '%PDF-'

  // Extraction needs no model, so it runs before the "is OCR configured" check.
  // A PDF with a text layer is readable even when no vision model has been
  // chosen, and refusing it would mean refusing work that costs nothing.
  if (looksLikePdf) {
    return readPdf(buffer, settings)
  }

  const mime = detectImageMime(buffer)
  if (!SUPPORTED_IMAGE_MIMES.has(mime)) {
    return jsonResponse(
      { error: 'This is not a PDF or a supported image. Images can be PNG, JPEG, GIF or WebP.' },
      415
    )
  }

  // The byte limit above does not bound an image on its own: these formats all
  // compress, so a few hundred kilobytes can declare dimensions of tens of
  // thousands of pixels and expand to gigabytes when decoded. The declared size is
  // therefore checked as well, before the file is passed to anything that would
  // decode it.
  const size = checkImageDimensions(buffer, mime)
  if (!size.ok) {
    return jsonResponse({ error: size.error }, 413)
  }

  if (!ocrIsConfigured(settings)) {
    return jsonResponse(
      {
        error:
          'Reading images is not set up yet. A super admin needs to choose a vision model under OCR settings.',
        notConfigured: true,
      },
      409
    )
  }

  const resolved = await resolveProvider(account.id, settings.providerId)
  if (!resolved.ok) return jsonResponse({ error: resolved.error }, resolved.status)

  const result = await transcribeImage(
    visionTargetFrom(resolved.provider, settings.modelId),
    buffer.toString('base64'),
    mime,
    OCR_INSTRUCTION
  )

  if (!result.ok) return jsonResponse({ error: result.error }, 502)

  return jsonResponse({
    method: 'image-vision',
    pages: [{ page: 1, text: result.text, viaVision: true }],
    totalPages: 1,
    truncated: false,
    // Reported so the UI can name the model that did the reading, which is the
    // only way to tell a bad read apart from a bad model choice.
    model: settings.modelId,
  })
}
