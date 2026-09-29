import { NextResponse } from 'next/server'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { authenticate, ensureBootstrapAdmin, sessionClaimsFor, touchLogin } from '@/lib/users'
import {
  checkRateLimit,
  clearFailures,
  globalPressure,
  recordFailure,
  recordGlobalFailure,
} from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 hours

/** Artificial delay so a wrong guess costs real time for an automated client. */
const FAILURE_DELAY_MS = 500

function clientIp(req: Request): string {
  // Cloudflare overwrites CF-Connecting-IP on every request it proxies, so it
  // is preferred when present. X-Forwarded-For is only a fallback.
  const cfIp = req.headers.get('cf-connecting-ip')?.trim()
  if (cfIp) return cfIp

  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

function isHttps(req: Request): boolean {
  const proto = req.headers.get('x-forwarded-proto')
  if (proto) return proto.split(',')[0].trim() === 'https'
  return new URL(req.url).protocol === 'https:'
}

export async function POST(req: Request) {
  const ip = clientIp(req)

  const pressure = globalPressure()
  if (pressure.blocked) {
    return NextResponse.json(
      { error: 'Terlalu banyak percobaan. Coba lagi nanti.' },
      { status: 429, headers: { 'Retry-After': String(pressure.retryAfterSeconds) } }
    )
  }

  const limit = checkRateLimit(ip)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Terlalu banyak percobaan. Coba lagi nanti.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  let email = ''
  let password = ''
  try {
    const body = await req.json()
    email = String(body?.email ?? '').trim()
    password = String(body?.password ?? '')
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 })
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Email dan password wajib diisi.' }, { status: 400 })
  }

  const secret = process.env.VMA_SESSION_SECRET || ''
  if (!secret) {
    return NextResponse.json({ error: 'Autentikasi server belum dikonfigurasi.' }, { status: 500 })
  }

  // Creates the first admin from the environment credentials if the user list is
  // still empty, so an existing deployment keeps the login it already had.
  await ensureBootstrapAdmin()

  const user = await authenticate(email, password)
  if (!user) {
    recordFailure(ip)
    recordGlobalFailure()
    await new Promise((resolve) =>
      setTimeout(resolve, FAILURE_DELAY_MS + globalPressure().extraDelayMs)
    )
    return NextResponse.json({ error: 'Email atau password salah.' }, { status: 401 })
  }

  clearFailures(ip)
  await touchLogin(user.id)

  const token = await createSessionToken(sessionClaimsFor(user), secret, SESSION_TTL_SECONDS)

  const response = NextResponse.json({
    ok: true,
    // Returned so the client can route without reading the cookie, which is
    // HttpOnly and therefore invisible to JavaScript.
    mustChangePassword: user.mustChangePassword,
    role: user.role,
  })
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(req),
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
  return response
}
