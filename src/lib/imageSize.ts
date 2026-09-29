// How large an uploaded image really is, read from its header.
//
// A byte limit alone does not bound an image. PNG, GIF and WebP all compress, so a
// file of a few hundred kilobytes can declare dimensions of tens of thousands of
// pixels per side and expand to gigabytes once something decodes it. A 20000 by
// 20000 PNG of a single flat colour is about 0.4 MB, so it passes a 12 MB check and
// then costs a provider whatever that many pixels cost. Checking the byte count
// alone therefore looks like a guard while leaving the expensive case open, which
// is why both are checked.
//
// Dimensions are read from the header rather than by decoding. Decoding is the
// thing being defended against, so it cannot also be the check. Nothing here is
// trusted as a format either: a header that does not parse returns null, and the
// caller refuses anything it cannot measure, because an unmeasurable image is
// exactly the shape a decompression bomb takes.
//
// PDFs are deliberately absent. Their page count is not known from a header, and
// their cost is already bounded where they are read, by the page limit in the OCR
// settings and by the scale pages are rendered at.

/** Largest image accepted from a user, by area. */
export const MAX_IMAGE_MEGAPIXELS = 40

export interface ImageDimensions {
  width: number
  height: number
}

/** Reads the pixel dimensions of a PNG. */
function pngSize(buffer: Buffer): ImageDimensions | null {
  // IHDR is required to be the first chunk, so its width and height sit at a fixed
  // offset: 8 signature bytes, then 4 length + 4 type, then the 13 IHDR bytes.
  if (buffer.length < 24) return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

/**
 * Reads the pixel dimensions of a JPEG.
 *
 * Walks the marker segments to the first frame header. The walk has to skip each
 * segment by its own length, or it reads a payload as a marker by accident.
 */
function jpegSize(buffer: Buffer): ImageDimensions | null {
  let offset = 2

  while (offset + 9 < buffer.length) {
    // Every segment starts with 0xFF. A byte that is not a marker start means the
    // walk has left the header, so there is nothing more that can be read.
    if (buffer[offset] !== 0xff) return null

    const marker = buffer[offset + 1]

    // Padding, and the standalone markers, carry no length field.
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }

    const segmentLength = buffer.readUInt16BE(offset + 2)
    if (segmentLength < 2) return null

    // Start of frame: any of these carries the dimensions. 0xC4, 0xC8 and 0xCC are
    // excluded because they share the range but hold tables, not a frame.
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

    if (isFrame) {
      if (offset + 9 >= buffer.length) return null
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) }
    }

    offset += 2 + segmentLength
  }

  return null
}

/** Reads the pixel dimensions of a GIF, which are little-endian. */
function gifSize(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 10) return null
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
}

/**
 * Reads the pixel dimensions of a WebP.
 *
 * Three of its four encodings state the size plainly. The fourth does not, so it
 * is reported as unknown rather than guessed: an unknown size is refused by the
 * caller, which is the safe reading of "cannot tell".
 */
function webpSize(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30) return null

  const format = buffer.subarray(12, 16).toString('latin1')

  if (format === 'VP8X') {
    // The canvas size is stored as three bytes minus one, per side.
    const width = (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1
    const height = (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1
    return { width, height }
  }

  if (format === 'VP8 ') {
    // A lossy frame starts with a three-byte start code, then two 14-bit sizes.
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    }
  }

  if (format === 'VP8L') {
    // Lossless packs both sizes into four bytes after the 0x2f signature.
    if (buffer[20] !== 0x2f) return null
    const bits = buffer.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }

  return null
}

/** Reads an image's declared dimensions, or null when they cannot be read. */
export function readImageDimensions(buffer: Buffer, mime: string): ImageDimensions | null {
  switch (mime) {
    case 'image/png':
      return pngSize(buffer)
    case 'image/jpeg':
      return jpegSize(buffer)
    case 'image/gif':
      return gifSize(buffer)
    case 'image/webp':
      return webpSize(buffer)
    default:
      return null
  }
}

export interface DimensionCheck {
  ok: boolean
  dimensions?: ImageDimensions
  /** Set when the image is refused, phrased for the person who uploaded it. */
  error?: string
}

/**
 * Accepts an image only if it is measurably within the area limit.
 *
 * A refusal and a failure to measure are reported the same way to the caller, since
 * the outcome is the same: this image is not read.
 */
export function checkImageDimensions(buffer: Buffer, mime: string): DimensionCheck {
  const dimensions = readImageDimensions(buffer, mime)

  if (!dimensions) {
    return { ok: false, error: 'The size of this image could not be read, so it was not accepted.' }
  }

  const megapixels = (dimensions.width * dimensions.height) / 1_000_000

  if (!Number.isFinite(megapixels) || megapixels > MAX_IMAGE_MEGAPIXELS) {
    return {
      ok: false,
      dimensions,
      error: `That image is too large to read: ${dimensions.width} by ${dimensions.height} is about ${Math.round(megapixels)} megapixels, and the limit is ${MAX_IMAGE_MEGAPIXELS}. Please resize it and try again.`,
    }
  }

  return { ok: true, dimensions }
}
