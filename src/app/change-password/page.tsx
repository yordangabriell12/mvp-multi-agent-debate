'use client'

import { useRef, useState } from 'react'

// Reached only while the account still holds a temporary password. The proxy
// sends anyone in that state here and lets nothing else through, so this screen
// has one job: replace the password and move on.
//
// The current password is asked for again even though the session is valid. A
// session can be stolen, a handed-over password cannot, and this is the moment
// the account changes hands.
//
// The sign-out link at the bottom is not decoration. The redirect that lands a
// person here fires on every page, so a user who cannot remember the temporary
// password they were given has no way out: every address sends them back to this
// form, and a wrong entry only reprints the error. Without the link the account
// is trapped in a screen it cannot complete and cannot leave.

const MIN_LENGTH = 8

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const currentRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setError('')

    if (newPassword.length < MIN_LENGTH) {
      setError(`Password baru minimal ${MIN_LENGTH} karakter.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok.')
      return
    }
    if (newPassword === currentPassword) {
      setError('Password baru harus berbeda dari password sementara.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      if (res.ok) {
        window.location.assign('/app')
        return
      }

      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'Tidak bisa menyimpan password. Coba lagi.')
      setCurrentPassword('')
      currentRef.current?.focus()
    } catch {
      setError('Tidak bisa menghubungi server. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-raised px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="bg-surface border border-border rounded-xl p-7">
          <h1 className="text-base font-semibold text-ink">Ganti password</h1>
          <p className="text-sm text-ink-muted mt-1 mb-6">
            Akun ini masih memakai password sementara. Buat password sendiri sebelum lanjut.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="current" className="block text-xs font-medium text-ink-light mb-1.5">
                Password sementara
              </label>
              <input
                id="current"
                ref={currentRef}
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint"
                required
              />
            </div>

            <div>
              <label htmlFor="next" className="block text-xs font-medium text-ink-light mb-1.5">
                Password baru
              </label>
              <input
                id="next"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint"
                required
                minLength={MIN_LENGTH}
              />
              <p className="text-[11px] text-ink-muted mt-1">Minimal {MIN_LENGTH} karakter.</p>
            </div>

            <div>
              <label htmlFor="confirm" className="block text-xs font-medium text-ink-light mb-1.5">
                Ulangi password baru
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint"
                required
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-sand-800 rounded-md hover:bg-sand-900 disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Menyimpan...' : 'Simpan password'}
            </button>
          </form>

          <p className="mt-5 pt-4 border-t border-border text-[11px] text-ink-muted text-center">
            Tidak ingat password sementara?{' '}
            <button
              type="button"
              onClick={async () => {
                // Clearing the cookie is what makes this work: the gate keeps every
                // page pointed here while the session lives, so signing out is the
                // only exit from a form the person cannot fill in.
                try {
                  await fetch('/api/auth/logout', { method: 'POST' })
                } catch { /* the redirect clears the session anyway */ }
                window.location.assign('/login')
              }}
              className="underline hover:text-ink transition-colors"
            >
              Keluar dan minta password baru
            </button>
          </p>
        </div>
      </div>
    </main>
  )
}
