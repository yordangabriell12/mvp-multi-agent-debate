// A small preview of an uploaded image, for showing in the conversation.
//
// The file itself is not kept as a data URL. Messages are written to localStorage and
// pushed to the server on every change, so storing a 4 MB photo as base64 would turn
// one upload into a several-megabyte write, repeated on each change, and localStorage
// tops out around 5 MB in most browsers. That is how a session starts failing to save
// without anyone connecting it to the picture they attached.
//
// A thumbnail is enough for the job, which is telling the reader what they attached.
// The original is read once for its text and never stored as bytes.

/** Longest edge of the preview, in pixels. */
const MAX_EDGE = 320

/** Above this, the data URL costs more than the preview is worth. */
const MAX_PREVIEW_CHARS = 120_000

export interface FilePreview {
  /** A downscaled image as a data URL, or null when the file is not an image. */
  thumbnail: string | null
  /** Width and height of the original, when it could be read. */
  width?: number
  height?: number
}

/**
 * Builds a preview for a file, or returns nothing when one does not apply.
 *
 * Never throws: a preview is a nicety, and failing to build one must not fail the
 * upload that the reader actually cares about.
 */
export async function buildFilePreview(file: File): Promise<FilePreview> {
  if (!file.type.startsWith('image/')) return { thumbnail: null }

  try {
    const bitmap = await loadImage(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return { thumbnail: null, width: bitmap.width, height: bitmap.height }

    context.drawImage(bitmap, 0, 0, width, height)
    const thumbnail = canvas.toDataURL('image/jpeg', 0.7)

    return {
      thumbnail: thumbnail.length <= MAX_PREVIEW_CHARS ? thumbnail : null,
      width: bitmap.width,
      height: bitmap.height,
    }
  } catch {
    // An image the browser cannot decode is still worth listing by name.
    return { thumbnail: null }
  }
}

/** Decodes a file into something drawable, and releases the object URL either way. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not decode that image'))
    }
    image.src = url
  })
}
