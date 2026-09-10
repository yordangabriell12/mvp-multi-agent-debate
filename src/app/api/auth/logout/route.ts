import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: new URL(req.url).protocol === 'https:',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
  return response
}
