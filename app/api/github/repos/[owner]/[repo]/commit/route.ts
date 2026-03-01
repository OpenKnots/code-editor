import { NextRequest, NextResponse } from 'next/server'
import { requireToken, githubFetch, errorResponse } from '@/app/api/github/_helpers'

/**
 * POST /api/github/repos/[owner]/[repo]/commit
 *
 * Commit one or more file changes via the GitHub API.
 *
 * Body: { files: [{ path, content, sha? }], message, branch? }
 *
 * Single file → Contents API (PUT)
 * Multi file  → Git Data API (create blobs → tree → commit → update ref)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const tokenResult = requireToken(request)
  if (tokenResult instanceof NextResponse) return tokenResult
  const token = tokenResult

  const { owner, repo } = await params
  const body = await request.json()
  const { files, message, branch = 'main' } = body as {
    files: Array<{ path: string; content: string; sha?: string }>
    message: string
    branch?: string
  }

  if (!files?.length || !message) {
    return errorResponse('files[] and message are required', 400)
  }

  try {
    if (files.length === 1) {
      // ─── Single file: Contents API ──────────────────────────
      const file = files[0]!
      const res = await githubFetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
        token,
        {
          method: 'PUT',
          body: JSON.stringify({
            message,
            content: Buffer.from(file.content).toString('base64'),
            sha: file.sha || undefined,
            branch,
          }),
        }
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return errorResponse((err as Record<string, string>).message || `GitHub ${res.status}`, res.status)
      }

      const data = await res.json() as Record<string, unknown>
      const commit = data.commit as Record<string, unknown> | undefined

      return NextResponse.json({
        sha: commit?.sha ?? 'unknown',
        url: (data.content as Record<string, unknown>)?.html_url ?? null,
        files: 1,
      })
    }

    // ─── Multi file: Git Data API ───────────────────────────

    // 1. Get current ref
    const refRes = await githubFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
      token
    )
    if (!refRes.ok) return errorResponse(`Failed to get ref: ${refRes.status}`, refRes.status)
    const refData = await refRes.json() as Record<string, unknown>
    const baseSha = ((refData.object as Record<string, unknown>).sha) as string

    // 2. Get base tree
    const commitRes = await githubFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${baseSha}`,
      token
    )
    if (!commitRes.ok) return errorResponse(`Failed to get commit: ${commitRes.status}`, commitRes.status)
    const commitData = await commitRes.json() as Record<string, unknown>
    const baseTreeSha = ((commitData.tree as Record<string, unknown>).sha) as string

    // 3. Create blobs
    const treeItems = await Promise.all(
      files.map(async (file) => {
        const blobRes = await githubFetch(
          `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              content: Buffer.from(file.content).toString('base64'),
              encoding: 'base64',
            }),
          }
        )
        if (!blobRes.ok) throw new Error(`Blob create failed: ${blobRes.status}`)
        const blobData = await blobRes.json() as Record<string, unknown>
        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha as string,
        }
      })
    )

    // 4. Create tree
    const treeRes = await githubFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
      }
    )
    if (!treeRes.ok) return errorResponse(`Tree create failed: ${treeRes.status}`, treeRes.status)
    const treeData = await treeRes.json() as Record<string, unknown>

    // 5. Create commit
    const newCommitRes = await githubFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          message,
          tree: treeData.sha,
          parents: [baseSha],
        }),
      }
    )
    if (!newCommitRes.ok) return errorResponse(`Commit create failed: ${newCommitRes.status}`, newCommitRes.status)
    const newCommitData = await newCommitRes.json() as Record<string, unknown>
    const newSha = newCommitData.sha as string

    // 6. Update ref
    const updateRes = await githubFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({ sha: newSha }),
      }
    )
    if (!updateRes.ok) return errorResponse(`Ref update failed: ${updateRes.status}`, updateRes.status)

    return NextResponse.json({ sha: newSha, files: files.length })
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500)
  }
}
