// Settings for reading text out of images and scanned documents.
//
// Reading a page requires a model that accepts an image, which is a different
// kind of model from the text-only ones used for debating. That is why this is
// its own setting rather than being inferred from the agents: an agent running
// deepseek-chat cannot read a screenshot, and pretending otherwise would fail
// with an error nobody can act on.
//
// The super admin owns this setting, like the provider keys. Other accounts
// inherit it and can use OCR but cannot change or read the credential behind it.

export interface OcrSettings {
  /** Provider to call. Must be one that is configured with a key. */
  providerId: string
  /** A vision-capable model id, for example `gpt-4o` or `claude-sonnet-4-20250514`. */
  modelId: string
  /**
   * Off by default. Until the super admin chooses a vision model, the upload
   * screen says OCR is not configured rather than failing per file.
   */
  enabled: boolean
  /** Pages of a PDF to read at most, so one large file cannot run up a bill. */
  maxPdfPages: number
}

export const DEFAULT_OCR_SETTINGS: OcrSettings = {
  providerId: '',
  modelId: '',
  enabled: false,
  maxPdfPages: 20,
}

/** Guards the stored value against a hand-edited or older file. */
export function normaliseOcrSettings(input: unknown): OcrSettings {
  const raw = (input ?? {}) as Partial<OcrSettings>
  const maxPages = Number(raw.maxPdfPages)
  return {
    providerId: typeof raw.providerId === 'string' ? raw.providerId : '',
    modelId: typeof raw.modelId === 'string' ? raw.modelId : '',
    enabled: raw.enabled === true,
    maxPdfPages:
      Number.isFinite(maxPages) && maxPages > 0 && maxPages <= 200
        ? Math.floor(maxPages)
        : DEFAULT_OCR_SETTINGS.maxPdfPages,
  }
}

/** True when OCR can actually run: switched on and pointed at a model. */
export function ocrIsConfigured(settings: OcrSettings): boolean {
  return settings.enabled && Boolean(settings.providerId) && Boolean(settings.modelId)
}
