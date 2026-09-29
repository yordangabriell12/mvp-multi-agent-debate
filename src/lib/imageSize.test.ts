// Tests for reading an image's real size from its header.
//
// The case that matters is the one a byte limit misses. A PNG that is a single
// flat colour compresses to a few hundred kilobytes whatever its dimensions, so
// "under 12 MB" says nothing about how much work it is. These tests pin the
// dimensions, not the byte count, and they use real headers rather than a stub so
// an offset mistake is caught here rather than in production.

import { describe, it, expect } from 'vitest'
import { deflateSync } from 'node:zlib'
import { checkImageDimensions, readImageDimensions, MAX_IMAGE_MEGAPIXELS } from '@/lib/imageSize'

/** Builds a valid PNG of the given size whose pixel data compresses to nothing. */
function buildFlatPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const typeBytes = Buffer.from(type, 'latin1')
    // The CRC is never verified by the reader under test, so a zero here keeps the
    // test free of a CRC implementation while leaving the layout correct.
    return Buffer.concat([length, typeBytes, data, Buffer.alloc(4)])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // greyscale

  // One filter byte then one byte per pixel, all zero: a black image.
  const raw = Buffer.alloc(height * (1 + width))
  const idat = deflateSync(raw, { level: 9 })

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Builds a JPEG header carrying the given size, with no image data after it. */
function buildJpegHeader(width: number, height: number): Buffer {
  const sof = Buffer.alloc(2 + 6 + 3)
  sof.writeUInt16BE(sof.length, 0)
  sof[2] = 0x08 // precision
  sof.writeUInt16BE(height, 3)
  sof.writeUInt16BE(width, 5)

  // A single segment before the frame, so the walk has to skip a length to reach
  // it. Without it the parser could pass by reading the frame first.
  const leading = Buffer.from([0xff, 0xe0, 0x00, 0x06, 0x41, 0x42, 0x43, 0x44])
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0]), sof, leading, Buffer.from([0xff, 0xd9])])
}

/** Builds a GIF header carrying the given size. */
function buildGifHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(13)
  header.write('GIF89a', 0, 'latin1')
  header.writeUInt16LE(width, 6)
  header.writeUInt16LE(height, 8)
  return header
}

/** Builds a WebP in the VP8X form, which states the canvas size. */
function buildWebpHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30)
  buffer.write('RIFF', 0, 'latin1')
  buffer.write('WEBP', 8, 'latin1')
  buffer.write('VP8X', 12, 'latin1')
  // Stored as three bytes, one less than the real value.
  buffer.writeUIntLE(width - 1, 24, 3)
  buffer.writeUIntLE(height - 1, 27, 3)
  return buffer
}

describe('reading image dimensions from a header', () => {
  it('reads a PNG', () => {
    expect(readImageDimensions(buildFlatPng(320, 240), 'image/png')).toEqual({ width: 320, height: 240 })
  })

  it('reads a JPEG, skipping the segment before the frame', () => {
    expect(readImageDimensions(buildJpegHeader(800, 600), 'image/jpeg')).toEqual({ width: 800, height: 600 })
  })

  it('reads a GIF', () => {
    expect(readImageDimensions(buildGifHeader(64, 32), 'image/gif')).toEqual({ width: 64, height: 32 })
  })

  it('reads a WebP canvas size', () => {
    expect(readImageDimensions(buildWebpHeader(1024, 768), 'image/webp')).toEqual({ width: 1024, height: 768 })
  })

  it('reports unknown for a header it cannot parse, rather than guessing', () => {
    // A refusal is the safe answer here, so null has to be reachable.
    expect(readImageDimensions(Buffer.from('not an image at all'), 'image/png')).toBeNull()
  })
})

describe('the area limit', () => {
  it('accepts an ordinary photo', () => {
    const result = checkImageDimensions(buildFlatPng(1200, 900), 'image/png')
    expect(result.ok).toBe(true)
    expect(result.dimensions).toEqual({ width: 1200, height: 900 })
  })

  it('refuses a decompression bomb that is well under any byte limit', () => {
    // 20000 by 20000 is 400 megapixels, and a flat-colour PNG of that size is a few
    // hundred kilobytes. This is the exact case a byte check alone lets through.
    const bomb = buildFlatPng(20000, 20000)

    expect(bomb.length).toBeLessThan(12 * 1024 * 1024)

    const result = checkImageDimensions(bomb, 'image/png')
    expect(result.ok).toBe(false)
    expect(result.dimensions).toEqual({ width: 20000, height: 20000 })
    expect(result.error).toContain(String(MAX_IMAGE_MEGAPIXELS))
  })

  it('refuses an image whose size cannot be read', () => {
    const result = checkImageDimensions(Buffer.from('truncated'), 'image/png')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
