'use client'

import { useEffect, useRef, useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [nextPath, setNextPath] = useState('/app')
  const emailRef = useRef<HTMLInputElement>(null)

  // Read `next` from the URL after mount. Doing it here instead of with
  // useSearchParams keeps this page out of a Suspense boundary at build time.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const target = params.get('next')
    if (target && target.startsWith('/') && !target.startsWith('//')) setNextPath(target)
    emailRef.current?.focus()
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        window.location.assign(nextPath)
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'Tidak bisa masuk. Coba lagi.')
      setPassword('')
    } catch {
      setError('Tidak bisa menghubungi server. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-raised px-4 py-10">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="bg-surface border border-border rounded-xl p-7">
          <div className="w-9 h-9 rounded-lg bg-sand-800 flex items-center justify-center mb-5">
            <span className="text-white text-sm font-semibold tracking-tight">V</span>
          </div>

          <h1 className="text-base font-semibold text-ink">Sign in to VMA</h1>
          <p className="text-sm text-ink-muted mt-1 mb-6">
            Multi-agent debate workspace. Access is restricted to authorised accounts.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="text-[11px] text-ink-faint block mb-1.5">
                Email
              </label>
              <input
                id="email"
                ref={emailRef}
                type="email"
                name="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm text-ink bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint focus-visible:ring-2 focus-visible:ring-sand-400 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="password" className="text-[11px] text-ink-faint block mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm text-ink bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint focus-visible:ring-2 focus-visible:ring-sand-400 transition-colors"
              />
            </div>

            {error && (
              <p
                role="alert"
                aria-live="polite"
                className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-sand-800 rounded-md hover:bg-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-[11px] text-ink-faint text-center mt-4">
          Failed attempts are rate limited. Five wrong tries locks this address for 15 minutes.
        </p>
      </div>
    </main>
  )
}
