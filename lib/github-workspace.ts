import {
  authHeaders,
  fetchPullRequests,
  getGithubToken,
  type PullRequestSummary,
} from '@/lib/github-api'

export type WorkspaceItemType = 'pr' | 'issue'

export interface GithubWorkspaceItem {
  id: string
  number: number
  type: WorkspaceItemType
  title: string
  body: string | null
  state: 'open' | 'closed'
  author: string
  assignees: string[]
  labels: Array<{ name: string; color: string }>
  comments: number
  updatedAt: string
  createdAt: string
  url: string
  draft?: boolean
  reviewDecision?: string
  additions?: number
  deletions?: number
  changedFiles?: number
  branch?: string
}

export interface GithubWorkspaceFilters {
  labels?: string[]
  authors?: string[]
  assignees?: string[]
}

export interface GithubWorkspaceResult {
  items: GithubWorkspaceItem[]
  source: 'github' | 'demo'
  reason?: 'missing-token' | 'missing-repo' | 'api-error'
  message?: string
}

interface GitHubIssueRaw {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  user?: { login: string }
  assignees?: Array<{ login: string }>
  labels?: Array<{ name?: string; color?: string }>
  comments: number
  updated_at: string
  created_at: string
  html_url: string
  pull_request?: unknown
}

function includesAny(values: string[], selected?: string[]) {
  if (!selected?.length) return true
  const haystack = new Set(values.map((value) => value.toLowerCase()))
  return selected.some((value) => haystack.has(value.toLowerCase()))
}

function matchesFilters(item: GithubWorkspaceItem, filters?: GithubWorkspaceFilters) {
  if (!filters) return true
  if (
    !includesAny(
      item.labels.map((label) => label.name),
      filters.labels,
    )
  )
    return false
  if (!includesAny([item.author], filters.authors)) return false
  if (!includesAny(item.assignees, filters.assignees)) return false
  return true
}

function mapPullRequest(pr: PullRequestSummary): GithubWorkspaceItem {
  return {
    id: `pr-${pr.number}`,
    number: pr.number,
    type: 'pr',
    title: pr.title,
    body: pr.body,
    state: pr.state,
    author: pr.author,
    assignees: [],
    labels: pr.labels,
    comments: 0,
    updatedAt: pr.updatedAt,
    createdAt: pr.createdAt,
    url: pr.url,
    draft: pr.draft,
    reviewDecision: pr.reviewDecision,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    branch: pr.headRef,
  }
}

function mapIssue(issue: GitHubIssueRaw): GithubWorkspaceItem {
  return {
    id: `issue-${issue.number}`,
    number: issue.number,
    type: 'issue',
    title: issue.title,
    body: issue.body,
    state: issue.state,
    author: issue.user?.login ?? 'unknown',
    assignees: issue.assignees?.map((assignee) => assignee.login) ?? [],
    labels: (issue.labels ?? []).map((label) => ({
      name: label.name ?? 'label',
      color: label.color ?? '6b7280',
    })),
    comments: issue.comments,
    updatedAt: issue.updated_at,
    createdAt: issue.created_at,
    url: issue.html_url,
  }
}

async function fetchIssues(repoFullName: string): Promise<GithubWorkspaceItem[]> {
  const res = await fetch(
    `https://api.github.com/repos/${repoFullName}/issues?state=open&per_page=30`,
    {
      headers: authHeaders(),
    },
  )
  if (!res.ok) throw new Error(`Failed to fetch issues: ${res.status}`)
  const data = (await res.json()) as GitHubIssueRaw[]
  return data.filter((issue) => !issue.pull_request).map(mapIssue)
}

function buildDemoItems(repoFullName?: string): GithubWorkspaceItem[] {
  const repo = repoFullName || 'owner/repo'
  return [
    {
      id: 'pr-demo-214',
      number: 214,
      type: 'pr',
      title: 'Refine mobile shell spacing and keyboard-safe bottom actions',
      body: 'Demo item shown until GitHub is connected. Hook up a token to see live PRs and Issues.',
      state: 'open',
      author: 'nova',
      assignees: ['val'],
      labels: [
        { name: 'ios', color: 'a855f7' },
        { name: 'ux', color: '2563eb' },
      ],
      comments: 6,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      url: `https://github.com/${repo}/pull/214`,
      draft: false,
      reviewDecision: 'REVIEW_REQUIRED',
      additions: 142,
      deletions: 38,
      changedFiles: 8,
      branch: 'feat/mobile-safe-shell',
    },
    {
      id: 'issue-demo-87',
      number: 87,
      type: 'issue',
      title: 'Tighten command palette grouping for workspace views',
      body: 'Demo issue with labels, author, and assignee chips so the layout still feels alive before auth.',
      state: 'open',
      author: 'val',
      assignees: ['nova'],
      labels: [
        { name: 'design', color: 'ec4899' },
        { name: 'good first issue', color: '22c55e' },
      ],
      comments: 3,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      url: `https://github.com/${repo}/issues/87`,
    },
  ]
}

export async function loadGithubWorkspace(
  repoFullName: string,
  filters?: GithubWorkspaceFilters,
): Promise<GithubWorkspaceResult> {
  if (!repoFullName) {
    return {
      items: buildDemoItems(),
      source: 'demo',
      reason: 'missing-repo',
      message: 'Add an owner/repo in Settings to turn on the PR & Issues workspace.',
    }
  }

  if (!getGithubToken()) {
    return {
      items: buildDemoItems(repoFullName).filter((item) => matchesFilters(item, filters)),
      source: 'demo',
      reason: 'missing-token',
      message:
        'Connect GitHub in Settings to replace the demo feed with live Issues and Pull Requests.',
    }
  }

  try {
    const [pullRequests, issues] = await Promise.all([
      fetchPullRequests(repoFullName, 'open', 30),
      fetchIssues(repoFullName),
    ])
    const items = [...pullRequests.map(mapPullRequest), ...issues]
      .filter((item) => matchesFilters(item, filters))
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

    return { items, source: 'github' }
  } catch (error) {
    return {
      items: buildDemoItems(repoFullName).filter((item) => matchesFilters(item, filters)),
      source: 'demo',
      reason: 'api-error',
      message: error instanceof Error ? error.message : 'Unable to load GitHub workspace.',
    }
  }
}
