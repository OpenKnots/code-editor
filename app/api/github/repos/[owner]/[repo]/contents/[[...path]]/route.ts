import { NextRequest, NextResponse } from 'next/server'
import { requireToken, githubFetch, errorResponse } from '@/app/api/github/_helpers'


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; path?: string[] }> }
) {
  const tokenOrRes = requireToken(req)
  if (tokenOrRes instanceof NextResponse) return tokenOrRes
  const token = tokenOrRes

  const { owner, repo, path: pathSegments } = await params
  const filePath = pathSegments?.join('/') || ''
  const ref = req.nextUrl.searchParams.get('ref') || undefined
  const headOwner = req.nextUrl.searchParams.get('headOwner') || owner
  const headRepo = req.nextUrl.searchParams.get('headRepo') || repo

  const url = new URL(`https://api.github.com/repos/${headOwner}/${headRepo}/contents/${filePath}`)
  if (ref) url.searchParams.set('ref', ref)

  const res = await githubFetch(url.toString(), token)
  if (!res.ok) {
    return errorResponse(`Failed to fetch contents: ${res.status}`, res.status)
  }

  const data = await res.json()
  return NextResponse.json(data)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; path?: string[] }> }
) {
  const tokenOrRes = requireToken(req)
  if (tokenOrRes instanceof NextResponse) return tokenOrRes
  const token = tokenOrRes

  const { owner, repo, path: pathSegments } = await params
  const filePath = pathSegments?.join('/') || ''

  const body = await req.json()
  const { content, message, sha, branch } = body as {
    content: string
    message: string
    sha?: string
    branch?: string
  }

  if (!content || !message) {
    return errorResponse('content and message are required', 400)
  }

  const payload: Record<string, unknown> = {
    message,
    content: Buffer.from(content).toString('base64'),
  }
  if (sha) payload.sha = sha
  if (branch) payload.branch = branch

  const res = await githubFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
    token,
    { method: 'PUT', body: JSON.stringify(payload) }
  )

  if (!res.ok) {
    const text = await res.text()
    return errorResponse(`Failed to update file: ${res.status} ${text}`, res.status)
  }

  const result = (await res.json()) as { content: { sha: string } }
  return NextResponse.json({ sha: result.content.sha })
}
