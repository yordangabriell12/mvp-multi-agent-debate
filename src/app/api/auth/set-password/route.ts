import { NextResponse } from 'next/server'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { findById, sessionClaimsFor, setPassword, verifyAccountPassword } from '@/lib/users'
import { getSession } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, private, max-age=0' }

/** Matches the login route, so a replaced password does not shorten the session. */
const SESSION_TTL_SECONDS = 60 * 60 * 12

/**
 * Marks the password as no longer temporary.
 *
 * The account holder supplies the password they were given plus a new one, so a
 * leaked session cookie on a temporary account cannot be used to take it over.
 * A fresh cookie is issued with the flag cleared, because the old one still
 * carries it.
 */
export async function POST(req: Request) {
  const secret = process.env.VMA_SESSION_SECRET || ''
  const session = await getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  let currentPassword = ''
  let newPassword = ''
  try {
    const body = await req.json()
    currentPassword = String(body?.currentPassword ?? '')
    newPassword = String(body?.newPassword ?? '')
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE })
  }

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'Both the current and the new password are required.' },
      { status: 400, headers: NO_STORE }
    )
  }

  const user = await findById(session.sub)
  if (!user) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404, headers: NO_STORE })
  }

  const currentOk = await verifyAccountPassword(user.id, currentPassword)
  if (!currentOk) {
    return NextResponse.json(
      { error: 'The current password is not correct.' },
      { status: 401, headers: NO_STORE }
    )
  }

  const result = await setPassword(user.id, newPassword, { mustChangePassword: false })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE })
  }

  // Read the account again: setPassword has just cleared the temporary flag, and
  // the in-memory copy above still says otherwise. The new cookie must reflect
  // the stored state, or the proxy keeps diverting to this screen.
  const updated = await findById(user.id)
  if (!updated) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404, headers: NO_STORE })
  }

  const token = await createSessionToken(sessionClaimsFor(updated), secret, SESSION_TTL_SECONDS)

  const response = NextResponse.json({ ok: true }, { headers: NO_STORE })
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(req.url).protocol === 'https:',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
  return response
}

