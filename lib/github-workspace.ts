import {
  fetchIssues,
  fetchPullRequests,
  getGithubToken,
  type IssueSummary,
  type PullRequestSummary,
} from '@/lib/github-api'
import type { WorkspaceFilterState } from '@/context/workspace-settings-context'

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
  state?: WorkspaceFilterState
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

function includesAny(values: string[], selected?: string[]) {
  if (!selected?.length) return true
  const haystack = new Set(values.map((value) => value.toLowerCase()))
  return selected.some((value) => haystack.has(value.toLowerCase()))
}

function matchesFilters(item: GithubWorkspaceItem, filters?: GithubWorkspaceFilters) {
  if (!filters) return true
  if (filters.state && filters.state !== 'all' && item.state !== filters.state) return false
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

function mapIssue(issue: IssueSummary): GithubWorkspaceItem {
  return {
    id: `issue-${issue.number}`,
    number: issue.number,
    type: 'issue',
    title: issue.title,
    body: issue.body,
    state: issue.state,
    author: issue.author,
    assignees: issue.assignees,
    labels: issue.labels,
    comments: issue.comments,
    updatedAt: issue.updatedAt,
    createdAt: issue.createdAt,
    url: issue.url,
  }
}

async function loadGithubIssues(
  repoFullName: string,
  filters?: GithubWorkspaceFilters,
): Promise<GithubWorkspaceItem[]> {
  const author = filters?.authors?.length === 1 ? filters.authors[0] : undefined
  const assignee = filters?.assignees?.length === 1 ? filters.assignees[0] : undefined
  const issues = await fetchIssues(repoFullName, {
    state: filters?.state ?? 'open',
    labels: filters?.labels,
    author,
    assignee,
    perPage: 30,
  })
  return issues.map(mapIssue)
}

async function loadGithubPullRequests(
  repoFullName: string,
  filters?: GithubWorkspaceFilters,
): Promise<GithubWorkspaceItem[]> {
  const pulls = await fetchPullRequests(repoFullName, filters?.state ?? 'open', 30)
  return pulls.map(mapPullRequest).filter((item) => matchesFilters(item, filters))
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

function buildFallbackMessage(filters?: GithubWorkspaceFilters) {
  const serverFilters = [
    filters?.state && filters.state !== 'open' ? `state:${filters.state}` : null,
    filters?.labels?.length ? `labels:${filters.labels.join(', ')}` : null,
    filters?.authors?.length === 1 ? `author:${filters.authors[0]}` : null,
    filters?.assignees?.length === 1 ? `assignee:${filters.assignees[0]}` : null,
  ].filter(Boolean)

  return serverFilters.length
    ? `Live GitHub fetch unavailable, so filters are falling back locally (${serverFilters.join(' • ')}).`
    : 'Connect GitHub in Settings to replace the demo feed with live Issues and Pull Requests.'
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
      message: buildFallbackMessage(filters),
    }
  }

  try {
    const [pullRequests, issues] = await Promise.all([
      loadGithubPullRequests(repoFullName, filters),
      loadGithubIssues(repoFullName, filters),
    ])
    const items = [...pullRequests, ...issues]
      .filter((item) => matchesFilters(item, filters))
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

    return {
      items,
      source: 'github',
      message:
        (filters?.authors?.length ?? 0) > 1 || (filters?.assignees?.length ?? 0) > 1
          ? 'Using GitHub query params where supported, then refining locally for multi-person filters.'
          : undefined,
    }
  } catch (error) {
    return {
      items: buildDemoItems(repoFullName).filter((item) => matchesFilters(item, filters)),
      source: 'demo',
      reason: 'api-error',
      message: error instanceof Error ? error.message : 'Unable to load GitHub workspace.',
    }
  }
}
