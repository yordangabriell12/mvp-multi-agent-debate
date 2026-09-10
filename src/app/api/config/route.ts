import { NextResponse } from 'next/server'
import { readConfig, writeConfig } from '@/lib/serverStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// This route sits behind the auth proxy: only a signed-in session can reach it,
// which is what keeps one person's API keys away from everyone else.

export async function GET() {
  const result = await readConfig()
  if (result.error) {
    return NextResponse.json({ config: null, updatedAt: null, warning: result.error })
  }
  return NextResponse.json({ config: result.config, updatedAt: result.updatedAt })
}

export async function PUT(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Expected a configuration object' }, { status: 400 })
  }

  const result = await writeConfig(body)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, updatedAt: result.updatedAt })
}
