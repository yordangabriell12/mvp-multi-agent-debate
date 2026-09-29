// Builds a minimal but valid PDF, for testing the text-extraction path.
//
// A real PDF is needed rather than a mock: the thing under test is whether the
// parser and the renderer agree on a genuine file, and a fake would prove
// nothing. The xref offsets are computed from the actual byte positions, because
// a wrong offset is exactly the kind of damage a hand-written fixture would hide.

import { Buffer } from 'node:buffer'

export interface MinimalPdfOptions {
  /** One line per page. Each page holds a single text run. */
  lines?: string[]
  /**
   * When true the page draws no text at all, only a filled rectangle.
   *
   * This is the shape of a scanned page: visually it has content, but there is no
   * text layer to extract, so a reader must fall back to rendering it.
   */
  imageOnly?: boolean
}

/** Escapes the characters that would otherwise end the PDF string early. */
function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

export function buildMinimalPdf(options: MinimalPdfOptions = {}): Buffer {
  const lines = options.lines ?? ['Hello OCR Test 123']
  const imageOnly = options.imageOnly === true

  // Object 1 is the catalog, 2 the page tree, then two objects per page
  // (content stream + page), and the font is appended last.
  const objects: string[] = []
  const pageObjectNumbers: number[] = []

  for (let i = 0; i < lines.length; i++) {
    const contentNumber = 3 + i * 2
    const pageNumber = contentNumber + 1
    pageObjectNumbers.push(pageNumber)

    // Coordinates are chosen so the run sits well inside the page box.
    const drawing = imageOnly
      ? '0.2 0.2 0.2 rg 72 700 400 60 re f'
      : `BT /F1 24 Tf 72 726 Td (${escapePdfText(lines[i])}) Tj ET`

    objects[contentNumber - 1] =
      `${contentNumber} 0 obj\n<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream\nendobj\n`

    objects[pageNumber - 1] =
      `${pageNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Contents ${contentNumber} 0 R /Resources << /Font << /F1 ${3 + lines.length * 2} 0 R >> >> >>\nendobj\n`
  }

  const fontNumber = 3 + lines.length * 2
  objects[0] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  objects[1] =
    '2 0 obj\n<< /Type /Pages /Kids [' +
    pageObjectNumbers.map((n) => `${n} 0 R`).join(' ') +
    `] /Count ${lines.length} >>\nendobj\n`
  objects[fontNumber - 1] =
    `${fontNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`

  // Assemble with a running byte count, recording where each object starts.
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += object
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  const total = objects.length + 1
  pdf += `xref\n0 ${total}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf +=
    `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}
