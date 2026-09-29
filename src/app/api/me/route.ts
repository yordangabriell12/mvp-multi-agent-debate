import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { readConfig } from '@/lib/serverStore'
import { toPublicUser } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Who am I, and what state is my workspace in?
//
// The client cannot read its own cookie, because it is HttpOnly, so it needs one
// call that answers "which account is this, what may it see, and has it seen the
// walkthrough". Doing that here rather than in the page keeps every screen
// working from the same answer.
//
// `tourSeen` travels with the account rather than only in localStorage: the
// walkthrough should greet someone on a machine they have never used, not just
// on the one where they first signed in.
const NO_STORE = { 'Cache-Control': 'no-store, private, max-age=0' }

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  const isAdmin = user.role === 'admin'
  const { config } = await readConfig(user.id, { keepKeys: isAdmin })
  const tourSeen = Boolean((config as { tourSeen?: boolean } | null)?.tourSeen)

  return NextResponse.json(
    {
      user: {
        ...toPublicUser(user),
        // Whether this account owns the provider keys, so the UI knows to show
        // the API Keys screen at all.
        isAdmin,
      },
      tourSeen,
      // How many providers actually have a key. A non-admin cannot see the keys,
      // but it does need to know whether the workspace is usable yet, so a model
      // picker can show an honest empty state instead of an error.
      providersReady: (config as { providers?: { hasKey?: boolean; apiKey?: string }[] } | null)
        ?.providers?.filter((p) => p.hasKey || p.apiKey).length ?? 0,
    },
    { headers: NO_STORE }
  )
}
