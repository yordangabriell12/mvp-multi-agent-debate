import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { deleteUser, findById, generatePassword, setPassword, setRole, toPublicUser } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, private, max-age=0' }

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Updates one account.
 *
 * Two actions share this route because both change the same record:
 * `reset-password` sets a new password (generated unless one is supplied), and
 * `set-role` promotes or demotes. A password set here is always temporary, so
 * the account holder has to replace it at their next sign-in.
 */
export async function PATCH(req: Request, context: RouteContext) {
  const check = await requireAdmin()
  if (check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status ?? 401, headers: NO_STORE })
  }

  const { id } = await context.params

  let body: { action?: string; password?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE })
  }

  const target = await findById(id)
  if (!target) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404, headers: NO_STORE })
  }

  if (body?.action === 'reset-password') {
    const generated = body.password ? undefined : generatePassword()
    const plain = body.password || generated || ''

    const result = await setPassword(id, plain, { mustChangePassword: true })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE })
    }

    return NextResponse.json(
      { user: toPublicUser({ ...target, mustChangePassword: true }), generatedPassword: generated },
      { headers: NO_STORE }
    )
  }

  if (body?.action === 'set-role') {
    const nextRole = body.role === 'admin' ? 'admin' : 'user'
    const result = await setRole(id, nextRole)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE })
    }
    return NextResponse.json({ user: result.user }, { headers: NO_STORE })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers: NO_STORE })
}

export async function DELETE(_req: Request, context: RouteContext) {
  const check = await requireAdmin()
  if (check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status ?? 401, headers: NO_STORE })
  }

  const { id } = await context.params
  const result = await deleteUser(id, check.user!.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE })
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
