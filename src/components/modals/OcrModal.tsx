'use client'

// Settings for reading text out of images and scanned documents.
//
// This screen exists because the feature is unusable without it. The route that
// reads a file takes its model from here rather than from the caller, so until a
// model is chosen every upload of a PDF or an image is refused. That refusal names
// this screen, so the screen has to be somewhere an administrator can find.
//
// It is offered only to the account that owns the provider keys, for the same
// reason the keys screen is: the model chosen here runs on their key and their
// bill. Every other account inherits the setting and never sees this panel.

import { useCallback, useEffect, useState } from 'react'
import { Modal } from './Modal'
import { useModalStore } from '@/store/modalStore'
import { useSettingsStore } from '@/store/settingsStore'
import { providerHasKey } from '@/types/provider'
import { DEFAULT_OCR_SETTINGS, normaliseOcrSettings, type OcrSettings } from '@/types/ocr'
import { cn } from '@/lib/utils'

/**
 * Models proven to actually read an image.
 *
 * The picker lists every model a provider offers, and most of them cannot see. Choosing
 * one of those raises no error: the model answers politely that no image was attached,
 * which reads as a failed upload rather than a blind model. Each id below was tested
 * against a picture of an invoice and had to report three values that exist only inside
 * it (a number, a total, a code), with a run without the image as the control. Anything
 * absent from this list is untested, not known to work.
 */
const VERIFIED_VISION_MODELS = [
  'deepseek-v4.1-flash',
  'deepseek-v4-flash-vision-exp',
  'glm-5.3-flashx',
  'kimi-k3',
  'kimi-k2.7-code',
]

function looksLikeVerifiedVisionModel(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return VERIFIED_VISION_MODELS.some((known) => id.includes(known))
}

export function OcrModal() {
  const activeModal = useModalStore((s) => s.activeModal)
  const closeModal = useModalStore((s) => s.closeModal)
  const providers = useSettingsStore((s) => s.providers)

  const [form, setForm] = useState<OcrSettings>(DEFAULT_OCR_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ocr/settings')
      const data = await res.json().catch(() => null)
      setForm(normaliseOcrSettings(data))
    } catch {
      setError('Could not load the current settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeModal !== 'ocr') return
    setError('')
    setSaved(false)
    void load()
  }, [activeModal, load])

  if (activeModal !== 'ocr') return null

  // Providers without a key are listed but not selectable: one cannot read a file
  // through a key that is not there.
  const usable = providers.filter(providerHasKey)
  const selected = providers.find((p) => p.id === form.providerId)
  const models = selected?.models || []

  const save = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/ocr/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Those settings were not saved.')
        return
      }
      setForm(normaliseOcrSettings(data))
      setSaved(true)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full px-2.5 py-1.5 text-xs bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint'

  return (
    <Modal
      open
      onClose={closeModal}
      title="Reading Documents"
      description="Which model reads PDFs and images when someone uploads one."
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {loading ? (
          <p className="text-xs text-ink-muted">Loading the current settings...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ocr-provider" className="text-[10px] text-ink-muted block mb-1">Provider</label>
                <select
                  id="ocr-provider"
                  value={form.providerId}
                  onChange={(e) => {
                    const provider = providers.find((p) => p.id === e.target.value)
                    // The model has to come from the same provider as the key, so the
                    // model choice is reset rather than carried across.
                    setForm({ ...form, providerId: e.target.value, modelId: provider?.models[0]?.id || '' })
                    setSaved(false)
                  }}
                  className={field}
                >
                  <option value="">Not chosen yet</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id} disabled={!providerHasKey(p)}>
                      {p.name}{providerHasKey(p) ? '' : ' (no key)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ocr-model" className="text-[10px] text-ink-muted block mb-1">Vision model</label>
                <select
                  id="ocr-model"
                  value={form.modelId}
                  onChange={(e) => { setForm({ ...form, modelId: e.target.value }); setSaved(false) }}
                  className={field}
                >
                  <option value="">Not chosen yet</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {/* The list holds every model the provider offers, and most cannot see.
                    Picking one of those fails quietly: the model replies that no image
                    was attached, so the upload looks broken rather than the model.
                    The note names only models proven against a real image. */}
                {form.modelId && !looksLikeVerifiedVisionModel(form.modelId) && (
                  <p className="text-[10px] text-rust mt-1 leading-relaxed">
                    This model has not been checked against an image. If it cannot see,
                    it will answer that no image arrived, which looks like a failed
                    upload. Known to read images: DeepSeek V4.1 Flash, DeepSeek V4 Flash
                    Vision, GLM-5.3 FlashX, Kimi K3.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="ocr-max-pages" className="text-[10px] text-ink-muted block mb-1">
                Pages read per PDF, at most
              </label>
              <input
                id="ocr-max-pages"
                type="number"
                min={1}
                max={200}
                value={form.maxPdfPages}
                onChange={(e) => { setForm({ ...form, maxPdfPages: Number(e.target.value) }); setSaved(false) }}
                className={cn(field, 'max-w-[120px]')}
              />
              <p className="text-[10px] text-ink-muted mt-1">
                Every page sent to a model costs money, so a long document stops here rather than being read to the end.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <button
                id="ocr-enabled"
                type="button"
                role="switch"
                aria-checked={form.enabled}
                onClick={() => { setForm({ ...form, enabled: !form.enabled }); setSaved(false) }}
                className={cn('w-8 h-4 rounded-full relative shrink-0 mt-0.5 transition-colors', form.enabled ? 'bg-sand-800' : 'bg-border-strong')}
              >
                <span className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all', form.enabled ? 'left-4.5' : 'left-0.5')} />
              </button>
              <div>
                <label htmlFor="ocr-enabled" className="text-xs text-ink">Read PDFs and images</label>
                <p className="text-[10px] text-ink-muted mt-0.5">
                  While this is off, uploading a PDF or an image is refused with an explanation. Text files are read either way, and a PDF that already carries a text layer is read without calling a model at all.
                </p>
              </div>
            </div>

            {form.enabled && (!form.providerId || !form.modelId) && (
              <p role="alert" className="text-[11px] text-red-700">
                Choose a provider and a model, or this cannot be switched on.
              </p>
            )}

            {usable.length === 0 && (
              <p className="text-[11px] text-ink-muted">
                No provider has a key yet. Add one under API Keys first.
              </p>
            )}
          </>
        )}

        {error && <p role="alert" className="text-[11px] text-red-700">{error}</p>}
        {saved && <p className="text-[11px] text-ink-muted">Saved.</p>}
      </div>

      <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
        <button onClick={closeModal} className="px-4 py-2 text-sm text-ink-muted hover:text-ink transition-colors">
          Close
        </button>
        <button
          onClick={save}
          disabled={saving || loading || (form.enabled && (!form.providerId || !form.modelId))}
          className="px-4 py-2 text-sm text-white bg-sand-800 hover:bg-ink rounded-lg transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
