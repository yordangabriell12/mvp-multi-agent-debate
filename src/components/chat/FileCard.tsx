'use client'

/**
 * The file someone attached to a question.
 *
 * An upload used to disappear into the document store, where it was available to the
 * agents as context but invisible in the conversation. The reader could not tell
 * whether the file had been received, and a later question about "the PDF I sent" had
 * nothing on screen to point at. This is the missing half: the same file, shown where
 * it was attached.
 *
 * A thumbnail is shown for an image and a typed icon for everything else, because a
 * preview cannot be drawn for a PDF without rasterising it and the name plus page count
 * already identifies the document.
 */

interface FileCardProps {
  name: string
  type: string
  size: number
  /** Present when the text came from a model reading the file rather than a text layer. */
  viaOcr?: boolean
  /** Which route produced the text, for the label. */
  method?: 'text' | 'pdf-text' | 'pdf-vision' | 'image-vision'
  /** Characters of text that were kept, shown so the reader knows it was read. */
  textLength?: number
  thumbnail?: string
  width?: number
  height?: number
  warning?: string
}

/** Human-readable size. Exact bytes are noise; the order of magnitude is the point. */
function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/**
 * What was done with the file, said plainly rather than shown as a raw mode name.
 *
 * `textLength` is what distinguishes "read by a route we can name" from "reading failed",
 * because a failed read leaves no method behind and claiming text was extracted would be
 * the one thing this label must not do.
 */
function readLabel(
  method: FileCardProps['method'],
  viaOcr?: boolean,
  textLength?: number
): string {
  if (method === 'pdf-text') return 'text layer read, no model needed'
  if (method === 'pdf-vision') return 'scanned, read by the vision model'
  if (method === 'image-vision' || viaOcr) return 'read by the vision model'
  if (method === 'text') return 'read as text'
  if (!textLength) return 'could not be read'
  return 'text extracted'
}

export function FileCard({
  name,
  type,
  size,
  viaOcr,
  method,
  textLength,
  thumbnail,
  width,
  height,
  warning,
}: FileCardProps) {
  const isPdf = type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')

  return (
    <figure className="max-w-[420px] rounded-xl border border-border bg-surface overflow-hidden">
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL, not a remote
        // asset; next/image would add a loader for no benefit and cannot size it.
        <img
          src={thumbnail}
          alt={name}
          className="w-full max-h-[260px] object-contain bg-surface-inset"
        />
      ) : (
        <div className="h-24 flex items-center justify-center bg-surface-inset text-ink-muted">
          <FileGlyph isPdf={isPdf} />
        </div>
      )}

      <figcaption className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-ink truncate" title={name}>
            {name}
          </span>
          <span className="text-[10px] text-ink-muted shrink-0 tabular-nums">
            {formatSize(size)}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-muted">
          <span>{readLabel(method, viaOcr, textLength)}</span>
          {typeof textLength === 'number' && textLength > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {textLength.toLocaleString('id-ID')} characters available to the agents
              </span>
            </>
          )}
          {width && height && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {width}×{height}
              </span>
            </>
          )}
        </div>

        {warning && (
          <p className="mt-1.5 text-[10px] text-rust leading-relaxed">{warning}</p>
        )}
      </figcaption>
    </figure>
  )
}

/** A typed placeholder, so the card does not read as a broken image. */
function FileGlyph({ isPdf }: { isPdf: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {isPdf ? (
        <>
          <path
            d="M14 3v5h5M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M8 14h8M8 17h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="9" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.4" />
          <path d="M4 18l5-5 3.5 3.5L16 13l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}
