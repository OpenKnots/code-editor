/**
 * Direct GitHub API client — no proxy, no API routes.
 * All calls go straight to api.github.com with the user's token.
 *
 * Works in Tauri (no CORS restrictions) and any browser context
 * where the GitHub API allows the request.
 */

let _token = ''

export function setGithubToken(token: string) {
  _token = token
}

export function getGithubToken(): string {
  return _token
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (_token) h.Authorization = `Bearer ${_token}`
  return h
}

async function ghFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...headers(), ...init?.headers },
  })
}

// ─── Types ─────────────────────────────────────────────────────

export interface TreeEntry {
  path: string
  type: 'blob' | 'tree'
  size?: number
  sha: string
}

export interface FileContent {
  content: string
  sha: string
  encoding: string
  size: number
  download_url?: string
}

export interface Branch {
  name: string
  protected: boolean
}

export interface Repo {
  full_name: string
  name: string
  owner: { login: string }
  private: boolean
  default_branch: string
}

// ─── Repository ────────────────────────────────────────────────

export async function fetchUserRepos(): Promise<Repo[]> {
  const all: Repo[] = []
  let page = 1
  while (page <= 10) {
    const res = await ghFetch(
      `https://api.github.com/user/repos?per_page=100&sort=updated&page=${page}`
    )
    if (!res.ok) break
    const data = (await res.json()) as Repo[]
    all.push(...data)
    if (data.length < 100) break
    page++
  }
  return all
}

// ─── Tree ──────────────────────────────────────────────────────

export async function fetchRepoTree(
  owner: string,
  repo: string,
  ref = 'HEAD',
  headOwner?: string,
  headRepo?: string,
): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const o = headOwner || owner
  const r = headRepo || repo

  // Resolve ref to SHA
  const refRes = await ghFetch(
    `https://api.github.com/repos/${o}/${r}/commits?sha=${encodeURIComponent(ref)}&per_page=1`
  )
  if (!refRes.ok) throw new Error(`Failed to resolve ref "${ref}": ${refRes.status}`)
  const commits = (await refRes.json()) as Array<{ sha: string }>
  if (!commits.length) throw new Error(`No commits for ref "${ref}"`)

  const treeRes = await ghFetch(
    `https://api.github.com/repos/${o}/${r}/git/trees/${commits[0].sha}?recursive=1`
  )
  if (!treeRes.ok) throw new Error(`Failed to fetch tree: ${treeRes.status}`)

  const data = (await treeRes.json()) as {
    tree: Array<{ path: string; type: string; size?: number; sha: string }>
    truncated: boolean
  }

  return {
    entries: data.tree
      .filter(e => e.type === 'blob' || e.type === 'tree')
      .map(e => ({ path: e.path, type: e.type as 'blob' | 'tree', size: e.size, sha: e.sha })),
    truncated: data.truncated,
  }
}

// ─── File Contents ─────────────────────────────────────────────

export async function fetchFileContents(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
  headOwner?: string,
  headRepo?: string,
): Promise<FileContent> {
  const o = headOwner || owner
  const r = headRepo || repo
  const url = new URL(`https://api.github.com/repos/${o}/${r}/contents/${path}`)
  if (ref) url.searchParams.set('ref', ref)

  const res = await ghFetch(url.toString())
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)

  const data = (await res.json()) as {
    content: string
    sha: string
    encoding: string
    size: number
    download_url?: string
  }

  return {
    content: data.encoding === 'base64' ? atob(data.content.replace(/\n/g, '')) : data.content,
    sha: data.sha,
    encoding: data.encoding,
    size: data.size,
    download_url: data.download_url,
  }
}

// ─── Branches ──────────────────────────────────────────────────

export async function fetchBranches(
  owner: string,
  repo: string,
): Promise<Branch[]> {
  const all: Branch[] = []
  let page = 1
  while (page <= 5) {
    const res = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100&page=${page}`
    )
    if (!res.ok) break
    const data = (await res.json()) as Array<{ name: string; protected: boolean }>
    all.push(...data.map(b => ({ name: b.name, protected: b.protected })))
    if (data.length < 100) break
    page++
  }
  return all
}

// ─── Create branch ──────────────────────────────────────────────

export async function createBranch(
  repoFullName: string,
  branchName: string,
  fromSha: string,
): Promise<boolean> {
  const res = await ghFetch(`https://api.github.com/repos/${repoFullName}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: fromSha }),
  })
  return res.ok
}

export async function fetchBranchesByName(repoFullName: string): Promise<Branch[]> {
  const [owner, repo] = repoFullName.split('/')
  return fetchBranches(owner, repo)
}

// ─── Commit (single + multi-file) ─────────────────────────────

export async function commitFiles(
  owner: string,
  repo: string,
  files: Array<{ path: string; content: string; sha?: string }>,
  message: string,
  branch = 'main',
): Promise<{ sha: string; files: number }> {
  if (files.length === 1) {
    const file = files[0]
    const res = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          message,
          content: btoa(unescape(encodeURIComponent(file.content))),
          sha: file.sha || undefined,
          branch,
        }),
      }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, string>
      throw new Error(err.message || `GitHub ${res.status}`)
    }
    const data = (await res.json()) as { commit: { sha: string } }
    return { sha: data.commit.sha, files: 1 }
  }

  // Multi-file: Git Data API
  // 1. Get current ref
  const refRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`)
  if (!refRes.ok) throw new Error(`Failed to get ref: ${refRes.status}`)
  const refData = (await refRes.json()) as { object: { sha: string } }
  const baseSha = refData.object.sha

  // 2. Get base tree
  const commitRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${baseSha}`)
  if (!commitRes.ok) throw new Error(`Failed to get commit: ${commitRes.status}`)
  const commitData = (await commitRes.json()) as { tree: { sha: string } }

  // 3. Create blobs
  const treeItems = await Promise.all(
    files.map(async (file) => {
      const blobRes = await ghFetch(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: btoa(unescape(encodeURIComponent(file.content))),
            encoding: 'base64',
          }),
        }
      )
      if (!blobRes.ok) throw new Error(`Blob create failed: ${blobRes.status}`)
      const blobData = (await blobRes.json()) as { sha: string }
      return { path: file.path, mode: '100644' as const, type: 'blob' as const, sha: blobData.sha }
    })
  )

  // 4. Create tree
  const treeRes = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees`,
    { method: 'POST', body: JSON.stringify({ base_tree: commitData.tree.sha, tree: treeItems }) }
  )
  if (!treeRes.ok) throw new Error(`Tree create failed: ${treeRes.status}`)
  const treeData = (await treeRes.json()) as { sha: string }

  // 5. Create commit
  const newCommitRes = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/commits`,
    { method: 'POST', body: JSON.stringify({ message, tree: treeData.sha, parents: [baseSha] }) }
  )
  if (!newCommitRes.ok) throw new Error(`Commit create failed: ${newCommitRes.status}`)
  const newCommit = (await newCommitRes.json()) as { sha: string }

  // 6. Update ref
  const updateRes = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    { method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha }) }
  )
  if (!updateRes.ok) throw new Error(`Ref update failed: ${updateRes.status}`)

  return { sha: newCommit.sha, files: files.length }
}

// ─── Pull Requests ─────────────────────────────────────────────

export interface PullRequestSummary {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  draft: boolean
  merged: boolean
  author: string
  authorAvatar: string
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  labels: Array<{ name: string; color: string }>
  headRef: string
  baseRef: string
  additions: number
  deletions: number
  changedFiles: number
  url: string
  reviewDecision?: string
}

export interface PullRequestFile {
  filename: string
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged'
  additions: number
  deletions: number
  patch?: string
  previous_filename?: string
  raw_url?: string
}

interface GitHubPullRaw {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  draft?: boolean
  merged_at: string | null
  user?: { login: string; avatar_url: string }
  created_at: string
  updated_at: string
  labels?: Array<{ name: string; color: string }>
  head?: { ref: string }
  base?: { ref: string }
  additions?: number
  deletions?: number
  changed_files?: number
  html_url: string
}

function mapPullRequest(p: GitHubPullRaw): PullRequestSummary {
  return {
    number: p.number,
    title: p.title,
    body: p.body,
    state: p.state,
    draft: p.draft ?? false,
    merged: !!p.merged_at,
    author: p.user?.login ?? 'unknown',
    authorAvatar: p.user?.avatar_url ?? '',
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    mergedAt: p.merged_at,
    labels: (p.labels || []).map(l => ({ name: l.name, color: l.color })),
    headRef: p.head?.ref ?? '',
    baseRef: p.base?.ref ?? '',
    additions: p.additions ?? 0,
    deletions: p.deletions ?? 0,
    changedFiles: p.changed_files ?? 0,
    url: p.html_url,
  }
}

export async function fetchPullRequests(
  repoFullName: string,
  state: 'open' | 'closed' | 'all' = 'open',
  perPage = 30,
): Promise<PullRequestSummary[]> {
  const res = await ghFetch(
    `https://api.github.com/repos/${repoFullName}/pulls?state=${state}&per_page=${perPage}&sort=updated&direction=desc`
  )
  if (!res.ok) throw new Error(`Failed to fetch PRs: ${res.status}`)
  const data = (await res.json()) as GitHubPullRaw[]
  return data.map(mapPullRequest)
}

export async function fetchPullRequest(
  repoFullName: string,
  number: number,
): Promise<PullRequestSummary> {
  const res = await ghFetch(
    `https://api.github.com/repos/${repoFullName}/pulls/${number}`
  )
  if (!res.ok) throw new Error(`Failed to fetch PR #${number}: ${res.status}`)
  const p = (await res.json()) as GitHubPullRaw
  return mapPullRequest(p)
}

export async function fetchPullRequestFiles(
  repoFullName: string,
  number: number,
): Promise<PullRequestFile[]> {
  const res = await ghFetch(
    `https://api.github.com/repos/${repoFullName}/pulls/${number}/files?per_page=100`
  )
  if (!res.ok) throw new Error(`Failed to fetch PR files: ${res.status}`)
  const data = (await res.json()) as PullRequestFile[]
  return data.map(f => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
    previous_filename: f.previous_filename,
    raw_url: f.raw_url,
  }))
}

export async function createPullRequest(
  repoFullName: string,
  title: string,
  body: string,
  head: string,
  base: string,
  draft = false,
): Promise<PullRequestSummary> {
  const res = await ghFetch(
    `https://api.github.com/repos/${repoFullName}/pulls`,
    {
      method: 'POST',
      body: JSON.stringify({ title, body, head, base, draft }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, string>
    throw new Error(err.message || `Failed to create PR: ${res.status}`)
  }
  const p = (await res.json()) as GitHubPullRaw
  return mapPullRequest(p)
}

export async function mergePullRequest(
  repoFullName: string,
  number: number,
  mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge',
  commitTitle?: string,
): Promise<{ merged: boolean; message: string; sha: string }> {
  const payload: Record<string, unknown> = { merge_method: mergeMethod }
  if (commitTitle) payload.commit_title = commitTitle
  const res = await ghFetch(
    `https://api.github.com/repos/${repoFullName}/pulls/${number}/merge`,
    { method: 'PUT', body: JSON.stringify(payload) }
  )
  const data = (await res.json()) as { merged?: boolean; message?: string; sha?: string }
  if (!res.ok) throw new Error(data.message || `Failed to merge PR: ${res.status}`)
  return { merged: data.merged ?? true, message: data.message ?? 'Merged', sha: data.sha ?? '' }
}

// ─── OAuth Device Flow (direct, no proxy) ──────────────────────

export async function requestDeviceCode(clientId: string): Promise<{
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  interval: number
}> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: 'repo read:user' }),
  })
  return res.json()
}

export async function pollDeviceToken(clientId: string, deviceCode: string): Promise<{
  access_token?: string
  error?: string
}> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })
  return res.json()
}

// ─── Create/Update single file (used by save) ─────────────────

export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string,
  branch?: string,
): Promise<{ sha: string }> {
  const payload: Record<string, unknown> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
  }
  if (sha) payload.sha = sha
  if (branch) payload.branch = branch

  const res = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { method: 'PUT', body: JSON.stringify(payload) }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to update ${path}: ${res.status} ${err}`)
  }
  const data = (await res.json()) as { content: { sha: string } }
  return { sha: data.content.sha }
}


// ─── Convenience wrappers (accept "owner/repo" string) ────────

function splitRepo(repo: string): [string, string] {
  const [owner, name] = repo.split('/')
  return [owner, name]
}

export async function fetchRepoTreeByName(
  repo: string,
  ref?: string,
  headRepo?: string,
): Promise<TreeEntry[]> {
  const [o, r] = splitRepo(headRepo || repo)
  const { entries } = await fetchRepoTree(o, r, ref || 'HEAD')
  return entries
}

export async function fetchFileContentsByName(
  repo: string,
  path: string,
  ref?: string,
  headRepo?: string,
): Promise<FileContent> {
  const [o, r] = splitRepo(headRepo || repo)
  return fetchFileContents(o, r, path, ref, undefined, undefined)
}

export async function commitFilesByName(
  repo: string,
  files: Array<{ path: string; content: string; sha?: string }>,
  message: string,
  branch = 'main',
): Promise<{ sha: string }> {
  const [o, r] = splitRepo(repo)
  return commitFiles(o, r, files, message, branch)
}

export async function createOrUpdateFileByName(
  repo: string,
  path: string,
  opts: { content: string; message: string; sha?: string; branch?: string },
): Promise<{ sha: string }> {
  const [o, r] = splitRepo(repo)
  return createOrUpdateFile(o, r, path, opts.content, opts.message, opts.sha, opts.branch)
}

export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (_token) h.Authorization = `Bearer ${_token}`
  return h
}
