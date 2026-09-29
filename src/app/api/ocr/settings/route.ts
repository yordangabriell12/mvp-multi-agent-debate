// OCR settings: readable by any signed-in account, writable only by the super admin.
//
// Every account needs to *read* these, because it decides whether the upload
// screen offers image reading or explains that it is not set up yet. Only the
// super admin may change them: the setting selects a model, and models are paid
// for with the super admin's key.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireAdmin } from '@/lib/session'
import { readOcrSettings, writeOcrSettings } from '@/lib/serverStore'
import { normaliseOcrSettings } from '@/types/ocr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, private, max-age=0' }

/** Any signed-in account may read: it decides whether the upload screen offers OCR. */
export async function GET() {
  const account = await getCurrentUser()
  if (!account) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  const settings = await readOcrSettings()
  return NextResponse.json(settings, { headers: NO_STORE })
}

/** Only the super admin may write: this selects the model their key pays for. */
export async function PUT(req: Request) {
  const check = await requireAdmin()
  // `check.user` is set for a non-admin too, so the decision is `check.error`.
  // Testing the user instead would let any signed-in account change the setting.
  if (check.error) {
    return NextResponse.json(
      { error: check.error },
      { status: check.status ?? 401, headers: NO_STORE }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE })
  }

  const settings = normaliseOcrSettings(body)

  // A switched-on setting with no model would fail on the first upload. Refusing
  // it here means the mistake surfaces on the settings screen, where it can be
  // understood, rather than later on a document.
  if (settings.enabled && (!settings.providerId || !settings.modelId)) {
    return NextResponse.json(
      { error: 'Choose a provider and a model before switching OCR on.' },
      { status: 400, headers: NO_STORE }
    )
  }

  const result = await writeOcrSettings(settings)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE })
  }

  return NextResponse.json(settings, { headers: NO_STORE })
}
