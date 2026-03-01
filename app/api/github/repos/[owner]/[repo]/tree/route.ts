import { NextRequest, NextResponse } from 'next/server'
import { requireToken, githubFetch, errorResponse } from '@/app/api/github/_helpers'


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const tokenOrRes = requireToken(req)
  if (tokenOrRes instanceof NextResponse) return tokenOrRes
  const token = tokenOrRes

  const { owner, repo } = await params
  const ref = req.nextUrl.searchParams.get('ref') || 'HEAD'

  // For fork PRs, the branch may only exist on the head (fork) repo.
  // The client can pass ?headOwner=x&headRepo=y to override the target.
  const headOwner = req.nextUrl.searchParams.get('headOwner') || owner
  const headRepo = req.nextUrl.searchParams.get('headRepo') || repo

  const refRes = await githubFetch(
    `https://api.github.com/repos/${headOwner}/${headRepo}/commits?sha=${encodeURIComponent(ref)}&per_page=1`,
    token
  )
  if (!refRes.ok) {
    return errorResponse(`Failed to resolve ref "${ref}": ${refRes.status}`, refRes.status)
  }
  const commits = (await refRes.json()) as Array<{ sha: string }>
  if (!commits.length) {
    return errorResponse(`No commits found for ref "${ref}"`, 404)
  }
  const { sha } = commits[0]

  const treeRes = await githubFetch(
    `https://api.github.com/repos/${headOwner}/${headRepo}/git/trees/${sha}?recursive=1`,
    token
  )
  if (!treeRes.ok) {
    return errorResponse(`Failed to fetch tree: ${treeRes.status}`, treeRes.status)
  }

  const data = (await treeRes.json()) as {
    tree: Array<{ path: string; type: string; size?: number; sha: string }>
    truncated: boolean
  }

  const entries = data.tree
    .filter((e) => e.type === 'blob' || e.type === 'tree')
    .map((e) => ({
      path: e.path,
      type: e.type as 'blob' | 'tree',
      size: e.size,
      sha: e.sha,
    }))

  return NextResponse.json({ entries, truncated: data.truncated })
}
