import { NextResponse } from 'next/server'
import { createSessionToken, safeEmailMatch, verifyPassword, SESSION_COOKIE } from '@/lib/auth'
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
    email = String(body?.email ?? '').trim().toLowerCase()
    password = String(body?.password ?? '')
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 })
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Email dan password wajib diisi.' }, { status: 400 })
  }

  const expectedEmail = (process.env.VMA_AUTH_EMAIL || '').trim().toLowerCase()
  const expectedHash = process.env.VMA_AUTH_PASSWORD_HASH || ''
  const expectedPlain = process.env.VMA_AUTH_PASSWORD || ''
  const secret = process.env.VMA_SESSION_SECRET || ''

  if (!expectedEmail || !secret || (!expectedHash && !expectedPlain)) {
    return NextResponse.json(
      { error: 'Autentikasi server belum dikonfigurasi.' },
      { status: 500 }
    )
  }

  // Run the hash comparison unconditionally so a wrong email and a wrong
  // password take a comparable amount of time.
  const passwordOk = await verifyPassword(password, expectedHash || expectedPlain)
  const emailOk = safeEmailMatch(email, expectedEmail)

  if (!emailOk || !passwordOk) {
    recordFailure(ip)
    recordGlobalFailure()
    await new Promise((resolve) =>
      setTimeout(resolve, FAILURE_DELAY_MS + globalPressure().extraDelayMs)
    )
    return NextResponse.json({ error: 'Email atau password salah.' }, { status: 401 })
  }

  clearFailures(ip)

  const token = await createSessionToken(expectedEmail, secret, SESSION_TTL_SECONDS)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(req),
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
  return response
}
