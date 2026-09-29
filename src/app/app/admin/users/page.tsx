'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

// User management. Admin only: the proxy turns everyone else away before this
// page is reached, and `/api/admin/users` checks the role again against the
// store, so this screen is convenience rather than the gate.
//
// A password created here is always temporary. The server returns the generated
// one exactly once, so the screen keeps it on display until the admin says they
// have written it down; there is no second chance to read it.

interface PublicUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  mustChangePassword: boolean
  createdAt: number
  lastLoginAt?: number
}

interface IssuedCredential {
  email: string
  password: string
}

function formatDate(value?: number): string {
  if (!value) return 'Belum pernah'
  return new Date(value).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<PublicUser[]>([])
  const [selfId, setSelfId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')

  // Held in component state only and never re-fetched, because the server keeps
  // nothing but the hash.
  const [issued, setIssued] = useState<IssuedCredential | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Tidak bisa memuat daftar akun.')
        return
      }
      setUsers(data.users || [])
      setSelfId(data.self || '')
      setError('')
    } catch {
      setError('Tidak bisa menghubungi server.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, role }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data?.error || 'Tidak bisa membuat akun.')
        return
      }

      if (data.generatedPassword) {
        setIssued({ email: data.user?.email || email, password: data.generatedPassword })
      }
      setEmail('')
      setName('')
      setRole('user')
      await load()
    } catch {
      setError('Tidak bisa menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  async function handleReset(user: PublicUser) {
    if (!window.confirm(`Buat password baru untuk ${user.email}?`)) return

    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-password' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Tidak bisa mengganti password.')
        return
      }
      if (data.generatedPassword) {
        setIssued({ email: user.email, password: data.generatedPassword })
      }
      await load()
    } catch {
      setError('Tidak bisa menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(user: PublicUser) {
    if (!window.confirm(`Hapus akun ${user.email}? Tindakan ini tidak bisa dibatalkan.`)) return

    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Tidak bisa menghapus akun.')
        return
      }
      await load()
    } catch {
      setError('Tidak bisa menghubungi server.')
    } finally {
      setBusy(false)
    }
  }


  return (
    <div className="p-6 max-w-3xl mx-auto w-full overflow-y-auto">
      {/* This screen replaces the whole workspace, so the sidebar's session list can
          no longer switch anything: it sets the active session in the store, while
          the page stays put. Without a way back, the only escape was the browser's
          own back button, and the app has no visible one. */}
      <Link
        href="/app"
        className="inline-flex items-center gap-1.5 mb-4 text-xs text-ink-muted hover:text-ink transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Kembali ke ruang debat
      </Link>
      <h1 className="text-lg font-semibold text-ink">Kelola akun</h1>
      <p className="text-sm text-ink-muted mt-1 mb-6">
        Buat akun untuk orang lain, atur ulang passwordnya, atau hapus. Semua akun memakai
        kunci API yang kamu simpan di sini, jadi mereka tidak perlu punya kunci sendiri.
      </p>

      {issued && (
        <div className="mb-6 border border-sage/40 bg-sage-light rounded-lg p-4">
          <p className="text-xs font-semibold text-sage">Password untuk {issued.email}</p>
          <p className="text-sm font-mono text-ink mt-2 break-all select-all">{issued.password}</p>
          <p className="text-[11px] text-ink-muted mt-2">
            Salin sekarang. Server hanya menyimpan hash-nya, jadi password ini tidak bisa
            ditampilkan lagi. Pemiliknya wajib menggantinya saat login pertama.
          </p>
          <button
            onClick={() => setIssued(null)}
            className="mt-3 px-3 py-1.5 text-[11px] text-ink-light border border-border rounded-md hover:bg-surface-hover transition-colors"
          >
            Sudah saya salin
          </button>
        </div>
      )}

      <form onSubmit={handleCreate} className="border border-border rounded-lg p-4 bg-surface-raised">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">Akun baru</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="new-email" className="block text-xs text-ink-light mb-1">Email</label>
            <input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@contoh.com"
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:border-ink-faint"
              required
            />
          </div>
          <div>
            <label htmlFor="new-name" className="block text-xs text-ink-light mb-1">
              Nama <span className="text-ink-muted">(opsional)</span>
            </label>
            <input
              id="new-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:border-ink-faint"
            />
          </div>
        </div>

        <div className="mt-3">
          <span className="block text-xs text-ink-light mb-1">Peran</span>
          <div className="flex gap-2">
            {(['user', 'admin'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                className={
                  'px-3 py-1.5 text-xs border rounded-md transition-colors ' +
                  (role === value
                    ? 'border-ink-faint bg-surface-hover text-ink'
                    : 'border-border text-ink-muted hover:text-ink')
                }
              >
                {value === 'admin' ? 'Super admin' : 'Pengguna'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-muted mt-1.5">
            Super admin bisa mengelola akun dan kunci API. Pengguna hanya bisa berdebat.
          </p>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-sand-800 rounded-md hover:bg-sand-900 disabled:opacity-60 transition-colors"
        >
          Buat akun dan password
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted mt-8 mb-3">
        Daftar akun
      </h2>
      <AccountList
        users={users}
        selfId={selfId}
        loading={loading}
        busy={busy}
        onReset={handleReset}
        onDelete={handleDelete}
      />
    </div>
  )
}

/**
 * The account list, kept in its own component so the page reads top to bottom:
 * what is happening, then who exists.
 *
 * "Reset password" and "Hapus" are disabled for the signed-in admin's own row.
 * The server refuses both anyway (it would be a way to lock yourself out), but a
 * disabled control explains the rule before it is broken.
 */
function AccountList({
  users,
  selfId,
  loading,
  busy,
  onReset,
  onDelete,
}: {
  users: PublicUser[]
  selfId: string
  loading: boolean
  busy: boolean
  onReset: (user: PublicUser) => void
  onDelete: (user: PublicUser) => void
}) {
  if (loading) {
    return <p className="text-sm text-ink-muted py-6">Memuat...</p>
  }

  if (users.length === 0) {
    return <p className="text-sm text-ink-muted py-6">Belum ada akun lain.</p>
  }

  return (
    <ul className="border border-border rounded-lg divide-y divide-border">
      {users.map((user) => {
        const isSelf = user.id === selfId
        return (
          <li key={user.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-ink truncate">{user.email}</span>
                {user.role === 'admin' && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium text-sage bg-sage-light rounded">
                    super admin
                  </span>
                )}
                {isSelf && <span className="text-[10px] text-ink-muted">(kamu)</span>}
              </div>
              <div className="text-[11px] text-ink-muted mt-0.5">
                {user.name} &middot; login terakhir: {formatDate(user.lastLoginAt)}
                {user.mustChangePassword && ' \u00b7 password belum diganti'}
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => onReset(user)}
                disabled={busy}
                className="px-2.5 py-1 text-[11px] text-ink-light border border-border rounded-md hover:bg-surface-hover disabled:opacity-60 transition-colors"
              >
                Reset password
              </button>
              <button
                onClick={() => onDelete(user)}
                disabled={busy || isSelf}
                title={isSelf ? 'Tidak bisa menghapus akun sendiri' : 'Hapus akun'}
                className="px-2.5 py-1 text-[11px] text-red-700 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-40 transition-colors"
              >
                Hapus
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

