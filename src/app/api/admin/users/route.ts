import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { createUser, listUsers } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The account list never changes without an edit, so it is never cached. */
const NO_STORE = { 'Cache-Control': 'no-store, private, max-age=0' }

export async function GET() {
  const check = await requireAdmin()
  // `check.error`, not `!check.user`: requireAdmin returns a user for a signed-in
  // non-admin as well, so testing the user would let a normal account read this.
  if (check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status ?? 401, headers: NO_STORE })
  }

  const users = await listUsers()
  return NextResponse.json({ users, self: check.user!.id }, { headers: NO_STORE })
}

export async function POST(req: Request) {
  const check = await requireAdmin()
  if (check.error) {
    return NextResponse.json({ error: check.error }, { status: check.status ?? 401, headers: NO_STORE })
  }

  let body: { email?: string; name?: string; role?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE })
  }

  const result = await createUser({
    email: String(body?.email ?? ''),
    name: body?.name ? String(body.name) : undefined,
    role: body?.role === 'admin' ? 'admin' : 'user',
    password: body?.password ? String(body.password) : undefined,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE })
  }

  // The generated password is returned here and nowhere else: the server keeps
  // only its hash, so this response is the one chance to copy it down.
  return NextResponse.json(
    { user: result.user, generatedPassword: result.generatedPassword },
    { status: 201, headers: NO_STORE }
  )
}
