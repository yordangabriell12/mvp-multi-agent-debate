import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

// Reached without a session. Everything else is gated.
const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout', '/robots.txt'])

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

  if (session) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
