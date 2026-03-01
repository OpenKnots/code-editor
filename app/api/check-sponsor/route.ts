import { NextResponse } from 'next/server'
import { withAuth, getWorkOS } from '@workos-inc/authkit-nextjs'

export async function GET() {
  const { user } = await withAuth()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const fullUser = await getWorkOS().userManagement.getUser(user.id)
  const plan = fullUser.metadata?.KnotCode

  if (plan !== 'pro') {
    return NextResponse.json(
      {
        error: 'not_pro',
        message: 'Your account does not have KnotCode Pro access.',
      },
      { status: 403 },
    )
  }

  return NextResponse.json({ ok: true, plan })
}
