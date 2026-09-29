import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

// Reached without a session. Everything else is gated.
const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/robots.txt',
])

/**
 * Reached without a session *or* while a password change is pending.
 *
 * A temporary password has to be replaced before anything else is reachable, so
 * the screen that does that, and the endpoint behind it, cannot sit behind the
 * same gate that sends the account there.
 */
const PASSWORD_CHANGE_PATHS = new Set(['/change-password', '/api/auth/set-password'])

/** Admin-only. The user management screen and its endpoints. */
const ADMIN_PREFIXES = ['/app/admin', '/api/admin']

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  // Static assets served from /public.
  if (pathname.startsWith('/fonts/') || pathname === '/favicon.ico') return true
  return false
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  const secret = process.env.VMA_SESSION_SECRET || ''
  const session = secret
    ? await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret)
    : null

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(loginUrl)
  }

  // Signed in, but still holding the password an administrator handed over.
  if (session.pwd) {
    if (PASSWORD_CHANGE_PATHS.has(pathname)) return NextResponse.next()

    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Replace your temporary password first.' },
        { status: 403 }
      )
    }

    const changeUrl = req.nextUrl.clone()
    changeUrl.pathname = '/change-password'
    changeUrl.search = ''
    return NextResponse.redirect(changeUrl)
  }

  // Signed in with a real password: the temporary screen has nothing to do.
  if (pathname === '/change-password') {
    const appUrl = req.nextUrl.clone()
    appUrl.pathname = '/app'
    appUrl.search = ''
    return NextResponse.redirect(appUrl)
  }

  // Role comes from the signed cookie, put there by the login route. A forged
  // role would have to be signed, so only a genuine admin carries 'admin' here.
  // Route handlers check the role again against the store, because this gate is
  // the cheap first pass, not the authority.
  if (ADMIN_PREFIXES.some((prefix) => pathname.startsWith(prefix)) && session.role !== 'admin') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }
    const appUrl = req.nextUrl.clone()
    appUrl.pathname = '/app'
    appUrl.search = ''
    return NextResponse.redirect(appUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
