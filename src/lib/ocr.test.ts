// Tests for the PDF reading paths, against real PDF bytes.
//
// The point of these is to establish that the two paths are told apart
// correctly. A document with a text layer must be read from that layer, because
// it is free and exact; a page with no layer must be reported as unreadable text
// so the caller knows to render it. Getting that decision wrong is the failure
// that matters: a scanned page silently treated as an empty one would look like
// a successful read of an empty document.

import { describe, it, expect } from 'vitest'
import { buildMinimalPdf } from '@/lib/testPdf'
import { extractPdfText, renderPdfPagesToPng, detectImageMime } from '@/lib/ocr'

describe('PDF text layer extraction', () => {
  it('reads the text of a text-based PDF', async () => {
    const pdf = buildMinimalPdf({ lines: ['Hello OCR Test 123'] })
    const { pages, totalPages } = await extractPdfText(pdf, 10)

    expect(totalPages).toBe(1)
    expect(pages).toHaveLength(1)
    expect(pages[0].text).toContain('Hello OCR Test 123')
  })

  it('reads every page of a multi-page PDF, in order', async () => {
    const pdf = buildMinimalPdf({ lines: ['First page alpha', 'Second page beta', 'Third page gamma'] })
    const { pages, totalPages } = await extractPdfText(pdf, 10)

    expect(totalPages).toBe(3)
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3])
    expect(pages[0].text).toContain('alpha')
    expect(pages[2].text).toContain('gamma')
  })

  it('reports a page with no text layer as empty, not as missing', async () => {
    // This is the shape of a scanned page. The distinction the caller needs is
    // "there is a page here and it has no text", not "there is no page".
    const pdf = buildMinimalPdf({ lines: ['placeholder'], imageOnly: true })
    const { pages, totalPages } = await extractPdfText(pdf, 10)

    expect(totalPages).toBe(1)
    expect(pages).toHaveLength(1)
    expect(pages[0].text).toBe('')
  })

  it('stops at the page limit and says how many pages exist', async () => {
    // The limit exists so one large upload cannot run up a bill. The caller is
    // told the real total so it can warn that pages were skipped.
    const pdf = buildMinimalPdf({ lines: ['one', 'two', 'three', 'four', 'five'] })
    const { pages, totalPages } = await extractPdfText(pdf, 2)

    expect(totalPages).toBe(5)
    expect(pages).toHaveLength(2)
  })

  it('rejects a file that is not a PDF instead of reading it as empty', async () => {
    const notAPdf = Buffer.from('this is plainly not a pdf', 'latin1')
    await expect(extractPdfText(notAPdf, 5)).rejects.toBeTruthy()
  })
})

describe('PDF page rendering', () => {
  it('renders a page to a PNG', async () => {
    const pdf = buildMinimalPdf({ lines: ['Scanned looking page'] })
    const rendered = await renderPdfPagesToPng(pdf, [1])

    expect(rendered).toHaveLength(1)
    expect(rendered[0].page).toBe(1)
    // Actually a PNG, judged by its signature rather than by the extension.
    expect(rendered[0].png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    expect(rendered[0].png.length).toBeGreaterThan(1000)
  })

  it('renders only the pages asked for', async () => {
    const pdf = buildMinimalPdf({ lines: ['a', 'b', 'c', 'd'] })
    const rendered = await renderPdfPagesToPng(pdf, [2, 4])
    expect(rendered.map((r) => r.page)).toEqual([2, 4])
  })

  it('skips page numbers beyond the document', async () => {
    const pdf = buildMinimalPdf({ lines: ['only page'] })
    const rendered = await renderPdfPagesToPng(pdf, [1, 99])
    expect(rendered.map((r) => r.page)).toEqual([1])
  })
})

describe('image type detection', () => {
  it('identifies the formats a vision model accepts', () => {
    expect(detectImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe('image/jpeg')
    expect(detectImageMime(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif')
    expect(detectImageMime(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]))).toBe('image/gif')
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4)])
    expect(detectImageMime(webp)).toBe('image/webp')
  })

  it('identifies the shortest valid header of each format', () => {
    // A GIF header is six bytes and a PNG header is eight. A single minimum
    // applied across all formats would reject both, which is the bug this pins
    // down.
    expect(detectImageMime(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])).length).toBeGreaterThan(0)
    expect(detectImageMime(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif')
    expect(detectImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png')
  })

  it('does not mistake a truncated signature for a real file', () => {
    // Two bytes are not enough to claim a format, so these must fall through.
    expect(detectImageMime(Buffer.from([0x89, 0x50]))).toBe('application/octet-stream')
    expect(detectImageMime(Buffer.from([0xff, 0xd8]))).toBe('application/octet-stream')
  })

  it('refuses anything else rather than guessing', () => {
    // A mislabelled file would be sent with the wrong media type and rejected by
    // the provider, so an unknown type is reported as unknown.
    expect(detectImageMime(Buffer.from('plain text file here'))).toBe('application/octet-stream')
    expect(detectImageMime(Buffer.alloc(0))).toBe('application/octet-stream')
  })
})
