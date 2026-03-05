'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useRepo } from '@/context/repo-context'
import { useView } from '@/context/view-context'
import { useLocal } from '@/context/local-context'
import { MarkdownPreview } from '@/components/markdown-preview'
import {
  fetchPullRequests,
  fetchPullRequest,
  fetchPullRequestFiles,
  createPullRequest,
  mergePullRequest,
  closePullRequest,
  updatePullRequest,
  fetchBranchesByName,
  fetchIssueComments,
  fetchPRReviewComments,
  fetchPRReviews,
  fetchPRChecks,
  addPRComment,
  type PullRequestSummary,
  type PullRequestFile,
  type IssueComment,
  type ReviewComment,
  type PRReview,
  type CheckRun,
} from '@/lib/github-api'

type RightPanel = 'empty' | 'detail' | 'create'
type MergeMethod = 'merge' | 'squash' | 'rebase'
type DetailTab = 'workflow' | 'files' | 'conversation' | 'checks' | 'reviews'
type FindingSeverity = 'BLOCKER' | 'IMPORTANT' | 'MINOR' | 'NOTE'

function timeAgo(dateStr: string): string {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function statusIcon(pr: PullRequestSummary): { icon: string; color: string } {
  if (pr.merged) return { icon: 'lucide:git-merge', color: 'text-[var(--color-merged,#8b5cf6)]' }
  if (pr.draft) return { icon: 'lucide:git-pull-request-draft', color: 'text-[var(--text-tertiary)]' }
  if (pr.state === 'closed') return { icon: 'lucide:git-pull-request-closed', color: 'text-[var(--color-deletions)]' }
  return { icon: 'lucide:git-pull-request', color: 'text-[var(--color-additions)]' }
}

type MediaKind = 'image' | 'video' | 'audio' | null

function detectMedia(filename: string): MediaKind {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogv', 'mov', 'm4v'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio'
  return null
}

function MediaPreview({ filename, url }: { filename: string; url?: string }) {
  const kind = detectMedia(filename)
  const name = filename.split('/').pop() ?? filename
  if (!url) {
    return (
      <div className="h-full w-full flex items-center justify-center p-6 bg-[var(--bg-subtle)]">
        <div className="text-center text-[var(--text-tertiary)]">
          <Icon icon={kind === 'image' ? 'lucide:image' : kind === 'video' ? 'lucide:video' : 'lucide:music'} width={32} height={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-[12px] font-medium">{name}</p>
          <p className="text-[10px] text-[var(--text-disabled)] mt-1">Preview unavailable</p>
        </div>
      </div>
    )
  }
  if (kind === 'image') return (
    <div className="h-full w-full flex items-center justify-center p-6 bg-[var(--bg-subtle)] overflow-auto">
      <div className="flex flex-col items-center gap-3">
        <img src={url} alt={name} className="max-w-full max-h-[60vh] object-contain rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-sm" />
        <span className="text-[10px] text-[var(--text-disabled)] font-mono">{name}</span>
      </div>
    </div>
  )
  if (kind === 'video') return (
    <div className="h-full w-full flex items-center justify-center p-6 bg-[var(--bg-subtle)] overflow-auto">
      <div className="flex flex-col items-center gap-3 w-full max-w-[720px]">
        <video src={url} controls className="max-w-full max-h-[60vh] rounded-lg border border-[var(--border)] bg-black shadow-sm" />
        <span className="text-[10px] text-[var(--text-disabled)] font-mono">{name}</span>
      </div>
    </div>
  )
  if (kind === 'audio') return (
    <div className="h-full w-full flex items-center justify-center p-6 bg-[var(--bg-subtle)] overflow-auto">
      <div className="w-full max-w-[480px] rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4 text-[var(--text-secondary)]">
          <div className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] flex items-center justify-center">
            <Icon icon="lucide:music-2" width={16} height={16} className="text-[var(--brand)]" />
          </div>
          <span className="text-[12px] font-medium truncate">{name}</span>
        </div>
        <audio src={url} controls className="w-full" />
      </div>
    </div>
  )
  return null
}

function statusBadge(pr: PullRequestSummary): { label: string; bg: string; fg: string } {
  if (pr.merged) return { label: 'Merged', bg: 'bg-[color-mix(in_srgb,var(--color-merged,#8b5cf6)_12%,transparent)]', fg: 'text-[var(--color-merged,#8b5cf6)]' }
  if (pr.draft) return { label: 'Draft', bg: 'bg-[var(--bg-subtle)]', fg: 'text-[var(--text-tertiary)]' }
  if (pr.state === 'closed') return { label: 'Closed', bg: 'bg-[color-mix(in_srgb,var(--color-deletions)_12%,transparent)]', fg: 'text-[var(--color-deletions)]' }
  return { label: 'Open', bg: 'bg-[color-mix(in_srgb,var(--color-additions)_12%,transparent)]', fg: 'text-[var(--color-additions)]' }
}

function extractSeverity(text: string | null | undefined): FindingSeverity | null {
  if (!text) return null
  const m = text.match(/\b(BLOCKER|IMPORTANT|MINOR|NOTE)\b/i)
  if (!m) return null
  return m[1].toUpperCase() as FindingSeverity
}

function severityWeight(s: FindingSeverity): number {
  switch (s) {
    case 'BLOCKER': return 4
    case 'IMPORTANT': return 3
    case 'MINOR': return 2
    case 'NOTE': return 1
  }
}

function severityTone(s: FindingSeverity): string {
  switch (s) {
    case 'BLOCKER': return 'text-[var(--color-deletions)] bg-[color-mix(in_srgb,var(--color-deletions)_12%,transparent)] border-[color-mix(in_srgb,var(--color-deletions)_30%,transparent)]'
    case 'IMPORTANT': return 'text-[var(--warning,#eab308)] bg-[color-mix(in_srgb,var(--warning,#eab308)_12%,transparent)] border-[color-mix(in_srgb,var(--warning,#eab308)_30%,transparent)]'
    case 'MINOR': return 'text-[var(--text-secondary)] bg-[var(--bg-subtle)] border-[var(--border)]'
    case 'NOTE': return 'text-[var(--text-tertiary)] bg-[var(--bg-subtle)] border-[var(--border)]'
  }
}

export function PrView() {
  const { repo } = useRepo()
  const { goBack } = useView()
  const local = useLocal()

  const [prs, setPrs] = useState<PullRequestSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open')
  const [search, setSearch] = useState('')
  const [labelFilter, setLabelFilter] = useState<string>('all')

  const [rightPanel, setRightPanel] = useState<RightPanel>('empty')
  const [selectedPr, setSelectedPr] = useState<PullRequestSummary | null>(null)
  const [prFiles, setPrFiles] = useState<PullRequestFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [activeFile, setActiveFile] = useState<PullRequestFile | null>(null)

  const [merging, setMerging] = useState(false)
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('squash')
  const [showMergeMenu, setShowMergeMenu] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [mergeSuccess, setMergeSuccess] = useState(false)
  const mergeMenuRef = useRef<HTMLDivElement>(null)

  const [branches, setBranches] = useState<string[]>([])
  const [createHead, setCreateHead] = useState('')
  const [createBase, setCreateBase] = useState('')
  const [createTitle, setCreateTitle] = useState('')
  const [createBody, setCreateBody] = useState('')
  const [createDraft, setCreateDraft] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // PR detail enrichment
  const [comments, setComments] = useState<IssueComment[]>([])
  const [reviewComments, setReviewComments] = useState<ReviewComment[]>([])
  const [reviews, setReviews] = useState<PRReview[]>([])
  const [checks, setChecks] = useState<CheckRun[]>([])
  const [loadingExtra, setLoadingExtra] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('workflow')

  // Close PR state
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  // Edit PR state
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)

  // Comment input + conversation UX
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [findingsOnly, setFindingsOnly] = useState(false)
  const [highlightFindingId, setHighlightFindingId] = useState<string | null>(null)
  const triageIdxRef = useRef({ blocker: 0, priority: 0 })

  const branchName = local.gitInfo?.branch || repo?.branch || 'main'
  const preferredBaseBranch = useMemo(() => {
    if (branches.includes('main')) return 'main'
    if (repo?.branch && branches.includes(repo.branch)) return repo.branch
    return branches[0] || 'main'
  }, [branches, repo?.branch])

  const loadPrs = useCallback(async () => {
    if (!repo) return
    setLoading(true)
    try {
      const data = await fetchPullRequests(repo.fullName, filter)
      setPrs(data)
    } catch (err) {
      console.error('Failed to load PRs:', err)
    }
    setLoading(false)
  }, [repo, filter])

  useEffect(() => { loadPrs() }, [loadPrs])

  const filterPresetKey = repo ? `ce:pr-filters:${repo.fullName}` : null

  useEffect(() => {
    if (!filterPresetKey) return
    try {
      const raw = localStorage.getItem(filterPresetKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { labelFilter?: string; findingsOnly?: boolean }
      if (parsed.labelFilter) setLabelFilter(parsed.labelFilter)
      if (typeof parsed.findingsOnly === 'boolean') setFindingsOnly(parsed.findingsOnly)
    } catch {}
  }, [filterPresetKey])

  useEffect(() => {
    if (!filterPresetKey) return
    try {
      localStorage.setItem(filterPresetKey, JSON.stringify({ labelFilter, findingsOnly }))
    } catch {}
  }, [filterPresetKey, labelFilter, findingsOnly])

  useEffect(() => {
    if (repo) {
      fetchBranchesByName(repo.fullName)
        .then(bs => setBranches(bs.map(b => b.name)))
        .catch(() => {})
    }
  }, [repo])

  // Listen for pr-open-create event from agent commands
  useEffect(() => {
    const handler = () => openCreateForm()
    window.addEventListener('pr-open-create', handler)
    return () => window.removeEventListener('pr-open-create', handler)
  }, [branchName, repo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showMergeMenu) return
    const handler = (e: MouseEvent) => {
      if (mergeMenuRef.current && !mergeMenuRef.current.contains(e.target as Node)) setShowMergeMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMergeMenu])

  const selectPr = useCallback(async (pr: PullRequestSummary) => {
    setSelectedPr(pr)
    setRightPanel('detail')
    setActiveFile(null)
    setMergeError(null)
    setMergeSuccess(false)
    setCloseError(null)
    setEditing(false)
    setDetailTab('workflow')
    setFindingsOnly(false)
    setHighlightFindingId(null)
    setLoadingFiles(true)
    setLoadingExtra(true)
    try {
      const [detail, files] = await Promise.all([
        fetchPullRequest(repo!.fullName, pr.number),
        fetchPullRequestFiles(repo!.fullName, pr.number),
      ])
      setSelectedPr(detail)
      setPrFiles(files)

      const [issueComments, prReviewComments, prReviews] = await Promise.all([
        fetchIssueComments(repo!.fullName, pr.number).catch(() => [] as IssueComment[]),
        fetchPRReviewComments(repo!.fullName, pr.number).catch(() => [] as ReviewComment[]),
        fetchPRReviews(repo!.fullName, pr.number).catch(() => [] as PRReview[]),
      ])
      setComments(issueComments)
      setReviewComments(prReviewComments)
      setReviews(prReviews)

      if (detail.headSha || detail.headRef) {
        fetchPRChecks(repo!.fullName, detail.headSha || detail.headRef)
          .then(setChecks)
          .catch(() => setChecks([]))
      }
    } catch (err) {
      console.error('Failed to load PR detail:', err)
    }
    setLoadingFiles(false)
    setLoadingExtra(false)
  }, [repo])

  const handleCreate = async () => {
    if (!repo || !createTitle.trim() || !createHead || !createBase) return
    setCreating(true)
    setCreateError(null)
    try {
      const newPr = await createPullRequest(repo.fullName, createTitle.trim(), createBody, createHead, createBase, createDraft)
      setCreateTitle('')
      setCreateBody('')
      setCreateDraft(false)
      setRightPanel('detail')
      setSelectedPr(newPr)
      setPrFiles([])
      loadPrs()
      selectPr(newPr)
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create PR')
    }
    setCreating(false)
  }

  const handleMerge = async () => {
    if (!repo || !selectedPr) return
    setMerging(true)
    setMergeError(null)
    try {
      await mergePullRequest(repo.fullName, selectedPr.number, mergeMethod)
      setMergeSuccess(true)
      setSelectedPr({ ...selectedPr, merged: true, state: 'closed' })
      loadPrs()
    } catch (err: any) {
      setMergeError(err?.message || 'Failed to merge')
    }
    setMerging(false)
    setShowMergeMenu(false)
  }

  const handleClose = async () => {
    if (!repo || !selectedPr) return
    setClosing(true)
    setCloseError(null)
    try {
      const updated = await closePullRequest(repo.fullName, selectedPr.number)
      setSelectedPr(updated)
      loadPrs()
    } catch (err: any) {
      setCloseError(err?.message || 'Failed to close PR')
    }
    setClosing(false)
  }

  const handleSaveEdit = async () => {
    if (!repo || !selectedPr) return
    setSaving(true)
    try {
      const updated = await updatePullRequest(repo.fullName, selectedPr.number, { title: editTitle, body: editBody })
      setSelectedPr(updated)
      setEditing(false)
      loadPrs()
    } catch (err: any) {
      console.error('Failed to update PR:', err)
    }
    setSaving(false)
  }

  const handlePostComment = async () => {
    if (!repo || !selectedPr || !newComment.trim()) return
    setPosting(true)
    try {
      const comment = await addPRComment(repo.fullName, selectedPr.number, newComment.trim())
      setComments(prev => [...prev, comment])
      setNewComment('')
    } catch (err: any) {
      console.error('Failed to post comment:', err)
    }
    setPosting(false)
  }

  const openCreateForm = () => {
    setRightPanel('create')
    setSelectedPr(null)
    setActiveFile(null)
    setCreateHead(branchName)
    setCreateBase(preferredBaseBranch)
    setCreateTitle('')
    setCreateBody('')
    setCreateDraft(false)
    setCreateError(null)
  }

  const startEditing = () => {
    if (!selectedPr) return
    setEditTitle(selectedPr.title)
    setEditBody(selectedPr.body || '')
    setEditing(true)
  }

  const availableLabels = useMemo(() => {
    const set = new Set<string>()
    prs.forEach(pr => pr.labels.forEach(l => set.add(l.name)))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [prs])

  const filteredPrs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return prs.filter(pr => {
      const matchesSearch = !q ||
        pr.title.toLowerCase().includes(q) ||
        pr.author.toLowerCase().includes(q) ||
        `#${pr.number}`.includes(q)
      const matchesLabel = labelFilter === 'all' || pr.labels.some(l => l.name === labelFilter)
      return matchesSearch && matchesLabel
    })
  }, [prs, search, labelFilter])

  useEffect(() => {
    if (labelFilter !== 'all' && !availableLabels.includes(labelFilter)) setLabelFilter('all')
  }, [availableLabels, labelFilter])

  const openCount = useMemo(() => filter === 'open' ? prs.length : 0, [prs, filter])

  const mergeMethodLabel: Record<MergeMethod, string> = {
    merge: 'Create merge commit',
    squash: 'Squash and merge',
    rebase: 'Rebase and merge',
  }

  const reviewSummary = useMemo(() => {
    const latest = new Map<string, PRReview>()
    reviews.filter(r => r.state !== 'COMMENTED' && r.state !== 'PENDING' && r.state !== 'DISMISSED').forEach(r => {
      latest.set(r.user.login, r)
    })
    const vals = Array.from(latest.values())
    return {
      approved: vals.filter(r => r.state === 'APPROVED').length,
      changesRequested: vals.filter(r => r.state === 'CHANGES_REQUESTED').length,
      total: vals.length,
    }
  }, [reviews])

  const checksSummary = useMemo(() => {
    const completed = checks.filter(c => c.status === 'completed')
    return {
      passed: completed.filter(c => c.conclusion === 'success' || c.conclusion === 'skipped' || c.conclusion === 'neutral').length,
      failed: completed.filter(c => c.conclusion === 'failure' || c.conclusion === 'timed_out' || c.conclusion === 'action_required').length,
      pending: checks.filter(c => c.status !== 'completed').length,
      total: checks.length,
    }
  }, [checks])

  const maintainerFindings = useMemo(() => {
    const fromIssue = comments
      .map(c => ({
        id: `issue-${c.id}`,
        author: c.user.login,
        body: c.body,
        createdAt: c.created_at,
        source: 'conversation' as const,
        severity: extractSeverity(c.body),
      }))
      .filter(f => !!f.severity)

    const fromReviewComments = reviewComments
      .map(c => ({
        id: `review-comment-${c.id}`,
        author: c.user.login,
        body: c.body,
        createdAt: c.created_at,
        source: `file:${c.path}` as const,
        severity: extractSeverity(c.body),
      }))
      .filter(f => !!f.severity)

    const fromReviews = reviews
      .map(r => ({
        id: `review-${r.id}`,
        author: r.user.login,
        body: r.body ?? '',
        createdAt: r.submitted_at,
        source: 'review' as const,
        severity: extractSeverity(r.body),
      }))
      .filter(f => !!f.severity)

    const all = [...fromIssue, ...fromReviewComments, ...fromReviews]
      .map(f => ({ ...f, severity: f.severity as FindingSeverity }))
      .sort((a, b) => {
        const sw = severityWeight(b.severity) - severityWeight(a.severity)
        if (sw !== 0) return sw
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })

    const counts = {
      BLOCKER: all.filter(f => f.severity === 'BLOCKER').length,
      IMPORTANT: all.filter(f => f.severity === 'IMPORTANT').length,
      MINOR: all.filter(f => f.severity === 'MINOR').length,
      NOTE: all.filter(f => f.severity === 'NOTE').length,
    }

    return { all, counts }
  }, [comments, reviewComments, reviews])

  const maintainerWorkflow = useMemo(() => {
    const hasApproval = reviewSummary.approved > 0
    const checksGreen = checksSummary.failed === 0 && checksSummary.pending === 0
    const hasBlockers = maintainerFindings.counts.BLOCKER > 0
    const hasImportant = maintainerFindings.counts.IMPORTANT > 0

    const reviewReady = !hasBlockers
    const prepareReady = reviewReady && !hasImportant && !selectedPr?.draft
    const mergeReady = prepareReady && hasApproval && checksGreen && selectedPr?.state === 'open' && !selectedPr?.merged

    const verdict: 'ready' | 'needs-work' | 'needs-discussion' = hasBlockers
      ? 'needs-work'
      : hasImportant
        ? 'needs-discussion'
        : mergeReady
          ? 'ready'
          : 'needs-discussion'

    return {
      reviewReady,
      prepareReady,
      mergeReady,
      hasApproval,
      checksGreen,
      verdict,
      blockers: [
        ...(hasBlockers ? [`${maintainerFindings.counts.BLOCKER} BLOCKER finding(s) unresolved`] : []),
        ...(!hasApproval ? ['At least one APPROVED review required'] : []),
        ...(checksSummary.failed > 0 ? ['Fix failing checks before merge'] : []),
        ...(checksSummary.pending > 0 ? ['Wait for CI checks to finish'] : []),
        ...(selectedPr?.draft ? ['Mark PR ready for review (currently draft)'] : []),
      ],
    }
  }, [reviewSummary, checksSummary, maintainerFindings, selectedPr])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
      if (!selectedPr) return

      const blockerList = maintainerFindings.all.filter(f => f.severity === 'BLOCKER')
      const priorityList = maintainerFindings.all.filter(f => f.severity === 'BLOCKER' || f.severity === 'IMPORTANT')

      // Shift+B → next BLOCKER
      if (e.shiftKey && e.key.toLowerCase() === 'b') {
        if (blockerList.length === 0) return
        e.preventDefault()
        const idx = triageIdxRef.current.blocker % blockerList.length
        triageIdxRef.current.blocker += 1
        setDetailTab('conversation')
        setFindingsOnly(true)
        setHighlightFindingId(blockerList[idx].id)
        return
      }

      // Shift+N → next BLOCKER/IMPORTANT
      if (e.shiftKey && e.key.toLowerCase() === 'n') {
        if (priorityList.length === 0) return
        e.preventDefault()
        const idx = triageIdxRef.current.priority % priorityList.length
        triageIdxRef.current.priority += 1
        setDetailTab('conversation')
        setFindingsOnly(true)
        setHighlightFindingId(priorityList[idx].id)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedPr, maintainerFindings])

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left panel -- PR list */}
      <div className="w-[300px] flex flex-col border-r border-[var(--border)] bg-[var(--bg)] shrink-0">
        <div className="flex items-center gap-2 h-[34px] px-3 border-b border-[var(--border)] shrink-0">
          <button onClick={goBack} className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors" title="Back">
            <Icon icon="lucide:arrow-left" width={14} height={14} />
          </button>
          <Icon icon="lucide:git-pull-request" width={13} height={13} className="text-[var(--brand)]" />
          <span className="text-[11px] font-semibold text-[var(--text-primary)] tracking-tight">Pull Requests</span>
          <div className="flex-1" />
          <button onClick={loadPrs} className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors" title="Refresh">
            <Icon icon="lucide:refresh-cw" width={12} height={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={openCreateForm} className="flex items-center gap-1 h-[22px] px-2 rounded-[var(--radius-sm)] bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)] cursor-pointer transition-colors text-[10px] font-medium" title="New Pull Request">
            <Icon icon="lucide:plus" width={11} height={11} />
            New
          </button>
        </div>

        <div className="flex items-center h-[30px] border-b border-[var(--border)] px-1.5 shrink-0 gap-0.5">
          {(['open', 'closed', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`flex items-center gap-1.5 h-[24px] px-2.5 text-[11px] font-medium rounded-[var(--radius-sm)] transition-colors cursor-pointer ${filter === f ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'open' && openCount > 0 && (
                <span className="px-1 min-w-[16px] text-center rounded-full bg-[var(--color-additions)] text-[var(--on-additions)] text-[9px] font-bold leading-[16px]">{openCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="px-2 py-1.5 border-b border-[var(--border)] shrink-0 space-y-1.5">
          <div className="relative">
            <Icon icon="lucide:search" width={12} height={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter pull requests..." className="w-full h-[26px] pl-7 pr-2 text-[11px] rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)] transition-colors" />
          </div>
          <div className="flex items-center gap-1.5">
            <Icon icon="lucide:tag" width={10} height={10} className="text-[var(--text-disabled)]" />
            <select
              value={labelFilter}
              onChange={e => setLabelFilter(e.target.value)}
              className="flex-1 h-[24px] px-2 text-[10px] rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] outline-none focus:border-[var(--border-focus)] cursor-pointer"
            >
              <option value="all">All labels</option>
              {availableLabels.map(label => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
            {labelFilter !== 'all' && (
              <button
                onClick={() => setLabelFilter('all')}
                className="h-[24px] px-1.5 rounded-[var(--radius-sm)] text-[10px] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                title="Clear label filter"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center"><Icon icon="lucide:loader" width={16} height={16} className="mx-auto animate-spin text-[var(--brand)]" /></div>
          ) : filteredPrs.length > 0 ? (
            filteredPrs.map(pr => {
              const si = statusIcon(pr)
              return (
                <button key={pr.number} onClick={() => selectPr(pr)} className={`w-full text-left px-3 py-2 border-b border-[var(--border)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors ${selectedPr?.number === pr.number ? 'bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]' : ''}`}>
                  <div className="flex items-start gap-2">
                    <Icon icon={si.icon} width={14} height={14} className={`${si.color} shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-[var(--text-primary)] leading-snug line-clamp-2">{pr.title}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] text-[var(--text-disabled)] font-mono">#{pr.number}</span>
                        <span className="text-[var(--text-disabled)]">&middot;</span>
                        <span className="text-[9px] text-[var(--text-tertiary)]">{pr.author}</span>
                        <span className="text-[var(--text-disabled)]">&middot;</span>
                        <span className="text-[9px] text-[var(--text-disabled)]">{timeAgo(pr.updatedAt)}</span>
                        {pr.changedFiles > 0 && (
                          <>
                            <span className="ml-auto text-[9px] font-mono text-[var(--color-additions)]">+{pr.additions}</span>
                            <span className="text-[9px] font-mono text-[var(--color-deletions)]">-{pr.deletions}</span>
                          </>
                        )}
                      </div>
                      {pr.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {pr.labels.slice(0, 3).map(l => (
                            <span key={l.name} className="px-1.5 py-px rounded-full text-[8px] font-medium border" style={{ backgroundColor: `#${l.color}20`, borderColor: `#${l.color}40`, color: `#${l.color}` }}>{l.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="py-12 text-center">
              <Icon icon="lucide:git-pull-request" width={28} height={28} className="mx-auto mb-2 opacity-20" />
              <p className="text-[11px] text-[var(--text-tertiary)]">No pull requests found</p>
              <p className="text-[10px] text-[var(--text-disabled)] mt-0.5">{search ? 'Try a different search' : `No ${filter} pull requests`}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col bg-[var(--bg-elevated)] overflow-hidden">
        {rightPanel === 'create' ? (
          <CreatePrForm
            branches={branches} defaultHead={branchName} defaultBase={preferredBaseBranch}
            head={createHead} base={createBase} title={createTitle} body={createBody}
            draft={createDraft} creating={creating} error={createError}
            onHeadChange={setCreateHead} onBaseChange={setCreateBase}
            onTitleChange={setCreateTitle} onBodyChange={setCreateBody}
            onDraftChange={setCreateDraft}
            onCancel={() => setRightPanel(selectedPr ? 'detail' : 'empty')}
            onCreate={handleCreate}
          />
        ) : rightPanel === 'detail' && selectedPr ? (
          activeFile ? (
            <DiffViewer file={activeFile} onBack={() => setActiveFile(null)} />
          ) : (
            <>
              {/* PR Header */}
              <PrHeader
                pr={selectedPr}
                editing={editing}
                editTitle={editTitle}
                editBody={editBody}
                saving={saving}
                onStartEdit={startEditing}
                onEditTitleChange={setEditTitle}
                onEditBodyChange={setEditBody}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={() => setEditing(false)}
                reviewSummary={reviewSummary}
                checksSummary={checksSummary}
              />

              {/* Action bar */}
              <ActionBar
                pr={selectedPr}
                merging={merging} mergeMethod={mergeMethod} showMergeMenu={showMergeMenu}
                mergeMenuRef={mergeMenuRef} mergeError={mergeError} mergeSuccess={mergeSuccess}
                mergeMethodLabel={mergeMethodLabel} closing={closing} closeError={closeError}
                onMergeMethodChange={setMergeMethod} onToggleMergeMenu={() => setShowMergeMenu(v => !v)}
                onMerge={handleMerge} onClose={handleClose}
              />

              {/* Detail tabs */}
              <div className="flex items-center h-[32px] border-b border-[var(--border)] bg-[var(--bg)] px-2 shrink-0 gap-0.5">
                {([
                  { id: 'workflow' as const, label: 'Workflow', icon: 'lucide:workflow', count: maintainerFindings.all.length },
                  { id: 'files' as const, label: 'Files', icon: 'lucide:files', count: prFiles.length },
                  { id: 'conversation' as const, label: 'Conversation', icon: 'lucide:message-circle', count: comments.length + reviewComments.length },
                  { id: 'reviews' as const, label: 'Reviews', icon: 'lucide:eye', count: reviews.filter(r => r.state !== 'COMMENTED' && r.state !== 'PENDING').length },
                  { id: 'checks' as const, label: 'Checks', icon: 'lucide:circle-check', count: checks.length },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setDetailTab(tab.id)}
                    className={`flex items-center gap-1.5 h-[26px] px-2.5 text-[10px] font-medium rounded-[var(--radius-sm)] transition-colors cursor-pointer ${
                      detailTab === tab.id ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <Icon icon={tab.icon} width={11} height={11} />
                    {tab.label}
                    {tab.count > 0 && (
                      <span className="px-1 min-w-[14px] text-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-disabled)] text-[8px] font-bold leading-[14px]">{tab.count}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto">
                {detailTab === 'workflow' && (
                  <WorkflowTab
                    pr={selectedPr}
                    findings={maintainerFindings}
                    reviewSummary={reviewSummary}
                    checksSummary={checksSummary}
                    workflow={maintainerWorkflow}
                    onOpenFindings={(focusBlockers) => {
                      setDetailTab('conversation')
                      setFindingsOnly(true)
                      const target = focusBlockers
                        ? maintainerFindings.all.find(f => f.severity === 'BLOCKER')?.id ?? null
                        : maintainerFindings.all[0]?.id ?? null
                      setHighlightFindingId(target)
                    }}
                  />
                )}
                {detailTab === 'files' && (
                  <FilesTab files={prFiles} loading={loadingFiles} onFileSelect={setActiveFile} />
                )}
                {detailTab === 'conversation' && (
                  <ConversationTab
                    comments={comments} reviewComments={reviewComments} loading={loadingExtra}
                    newComment={newComment} posting={posting}
                    onNewCommentChange={setNewComment} onPost={handlePostComment}
                    prState={selectedPr.state}
                    findings={maintainerFindings}
                    findingsOnly={findingsOnly}
                    onFindingsOnlyChange={setFindingsOnly}
                    highlightFindingId={highlightFindingId}
                    onHighlightConsumed={() => setHighlightFindingId(null)}
                  />
                )}
                {detailTab === 'reviews' && (
                  <ReviewsTab reviews={reviews} loading={loadingExtra} />
                )}
                {detailTab === 'checks' && (
                  <ChecksTab checks={checks} loading={loadingExtra} />
                )}
              </div>
            </>
          )
        ) : (
          <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--text-disabled)]">
            <div className="text-center">
              <Icon icon="lucide:git-pull-request" width={32} height={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-[12px] text-[var(--text-tertiary)] font-medium">Select a pull request to review</p>
              <p className="text-[10px] text-[var(--text-disabled)] mt-1">Or create a new one with the + button</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── PR Header ─────────────────────────────────────────────────

function PrHeader({ pr, editing, editTitle, editBody, saving, onStartEdit, onEditTitleChange, onEditBodyChange, onSaveEdit, onCancelEdit, reviewSummary, checksSummary }: {
  pr: PullRequestSummary
  editing: boolean; editTitle: string; editBody: string; saving: boolean
  onStartEdit: () => void; onEditTitleChange: (v: string) => void; onEditBodyChange: (v: string) => void
  onSaveEdit: () => void; onCancelEdit: () => void
  reviewSummary: { approved: number; changesRequested: number; total: number }
  checksSummary: { passed: number; failed: number; pending: number; total: number }
}) {
  const badge = statusBadge(pr)

  return (
    <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
      <div className="flex items-start gap-2 mb-2">
        <Icon icon={statusIcon(pr).icon} width={16} height={16} className={`${statusIcon(pr).color} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input type="text" value={editTitle} onChange={e => onEditTitleChange(e.target.value)} className="w-full h-[28px] px-2 text-[13px] font-semibold rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]" />
              <textarea value={editBody} onChange={e => onEditBodyChange(e.target.value)} rows={4} className="w-full px-2 py-1.5 text-[11px] rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] outline-none resize-y focus:border-[var(--border-focus)] leading-relaxed font-sans min-h-[60px]" />
              <div className="flex items-center gap-2">
                <button onClick={onSaveEdit} disabled={saving} className="flex items-center gap-1 h-[24px] px-2.5 rounded-[var(--radius-sm)] bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)] text-[10px] font-medium cursor-pointer transition-colors">
                  {saving ? <Icon icon="lucide:loader" width={10} height={10} className="animate-spin" /> : <Icon icon="lucide:check" width={10} height={10} />}
                  Save
                </button>
                <button onClick={onCancelEdit} className="h-[24px] px-2 rounded-[var(--radius-sm)] text-[10px] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <h2 className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug flex-1">{pr.title}</h2>
                {pr.state === 'open' && (
                  <button onClick={onStartEdit} className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors shrink-0" title="Edit">
                    <Icon icon="lucide:pencil" width={11} height={11} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-1.5 h-[18px] rounded-full text-[9px] font-semibold ${badge.bg} ${badge.fg}`}>{badge.label}</span>
                <span className="text-[10px] text-[var(--text-disabled)]">#{pr.number}</span>
                <span className="text-[var(--text-disabled)]">&middot;</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">{pr.author}</span>
                <span className="text-[var(--text-disabled)]">&middot;</span>
                <span className="text-[10px] text-[var(--text-disabled)]">{timeAgo(pr.updatedAt)}</span>

                {reviewSummary.total > 0 && (
                  <>
                    <span className="text-[var(--text-disabled)]">&middot;</span>
                    {reviewSummary.approved > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] text-[var(--color-additions)] font-medium">
                        <Icon icon="lucide:check-circle-2" width={10} height={10} /> {reviewSummary.approved}
                      </span>
                    )}
                    {reviewSummary.changesRequested > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] text-[var(--warning,#eab308)] font-medium">
                        <Icon icon="lucide:alert-circle" width={10} height={10} /> {reviewSummary.changesRequested}
                      </span>
                    )}
                  </>
                )}
                {checksSummary.total > 0 && (
                  <>
                    <span className="text-[var(--text-disabled)]">&middot;</span>
                    <span className={`flex items-center gap-0.5 text-[9px] font-medium ${
                      checksSummary.failed > 0 ? 'text-[var(--color-deletions)]' : checksSummary.pending > 0 ? 'text-[var(--warning,#eab308)]' : 'text-[var(--color-additions)]'
                    }`}>
                      <Icon icon={checksSummary.failed > 0 ? 'lucide:x-circle' : checksSummary.pending > 0 ? 'lucide:clock' : 'lucide:check-circle-2'} width={10} height={10} />
                      {checksSummary.passed}/{checksSummary.total}
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {!editing && (
        <>
          <div className="flex items-center gap-1.5 text-[10px] ml-[24px]">
            <span className="font-mono text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-1.5 py-px rounded-[var(--radius-sm)]">{pr.headRef}</span>
            <Icon icon="lucide:arrow-right" width={10} height={10} className="text-[var(--text-disabled)]" />
            <span className="font-mono text-[var(--text-secondary)] bg-[var(--bg-subtle)] px-1.5 py-px rounded-[var(--radius-sm)]">{pr.baseRef}</span>
            <div className="flex-1" />
            <span className="font-mono text-[var(--color-additions)] font-medium">+{pr.additions}</span>
            <span className="font-mono text-[var(--color-deletions)] font-medium">-{pr.deletions}</span>
            <span className="text-[var(--text-disabled)]">&middot;</span>
            <span className="text-[var(--text-disabled)]">{pr.changedFiles} files</span>
          </div>
          {pr.body && (
            <div className="mt-2 ml-[24px] max-h-[180px] overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
              <MarkdownPreview content={pr.body} className="text-[11px] text-[var(--text-secondary)] leading-relaxed" />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Action Bar ────────────────────────────────────────────────

function ActionBar({ pr, merging, mergeMethod, showMergeMenu, mergeMenuRef, mergeError, mergeSuccess, mergeMethodLabel, closing, closeError, onMergeMethodChange, onToggleMergeMenu, onMerge, onClose }: {
  pr: PullRequestSummary
  merging: boolean; mergeMethod: MergeMethod; showMergeMenu: boolean
  mergeMenuRef: React.RefObject<HTMLDivElement | null>
  mergeError: string | null; mergeSuccess: boolean
  mergeMethodLabel: Record<MergeMethod, string>
  closing: boolean; closeError: string | null
  onMergeMethodChange: (m: MergeMethod) => void; onToggleMergeMenu: () => void
  onMerge: () => void; onClose: () => void
}) {
  return (
    <div className="flex items-center gap-2 h-[38px] px-4 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
      {pr.state === 'open' && !pr.merged ? (
        <>
          <div className="relative flex items-center" ref={mergeMenuRef}>
            <button onClick={onMerge} disabled={merging} className={`flex items-center gap-1.5 h-[28px] px-3 rounded-l-[var(--radius-sm)] text-[11px] font-semibold transition-all cursor-pointer ${merging ? 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed' : 'bg-[var(--color-additions)] text-[var(--on-additions)] hover:opacity-90'}`}>
              {merging ? <Icon icon="lucide:loader" width={12} height={12} className="animate-spin" /> : <Icon icon="lucide:git-merge" width={12} height={12} />}
              {merging ? 'Merging...' : mergeMethodLabel[mergeMethod].split(' ')[0]}
            </button>
            <button onClick={onToggleMergeMenu} className="flex items-center justify-center w-[28px] h-[28px] rounded-r-[var(--radius-sm)] bg-[var(--color-additions)] text-[var(--on-additions)] border-l border-[var(--on-additions)]/20 hover:opacity-90 cursor-pointer transition-colors">
              <Icon icon="lucide:chevron-down" width={10} height={10} />
            </button>
            {showMergeMenu && (
              <div className="absolute top-full left-0 mt-1 w-52 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] z-50 overflow-hidden animate-scale-in">
                {(['merge', 'squash', 'rebase'] as const).map(m => (
                  <button key={m} onClick={() => { onMergeMethodChange(m); onToggleMergeMenu() }} className={`w-full text-left px-3 h-[32px] text-[11px] hover:bg-[var(--bg-subtle)] cursor-pointer flex items-center gap-2 transition-colors ${mergeMethod === m ? 'text-[var(--color-additions)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                    {mergeMethod === m && <Icon icon="lucide:check" width={10} height={10} />}
                    <span className={mergeMethod === m ? '' : 'ml-[18px]'}>{mergeMethodLabel[m]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} disabled={closing} className="flex items-center gap-1 h-[28px] px-3 rounded-[var(--radius-sm)] text-[11px] font-medium text-[var(--color-deletions)] hover:bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)] cursor-pointer transition-colors">
            {closing ? <Icon icon="lucide:loader" width={11} height={11} className="animate-spin" /> : <Icon icon="lucide:x-circle" width={11} height={11} />}
            Close
          </button>
        </>
      ) : mergeSuccess ? (
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-additions)] font-medium">
          <Icon icon="lucide:check-circle" width={14} height={14} /> Pull request merged
        </span>
      ) : pr.merged ? (
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-merged,#8b5cf6)] font-medium">
          <Icon icon="lucide:git-merge" width={14} height={14} /> Merged {pr.mergedAt ? timeAgo(pr.mergedAt) : ''}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-deletions)] font-medium">
          <Icon icon="lucide:x-circle" width={14} height={14} /> Closed
        </span>
      )}

      {(mergeError || closeError) && (
        <span className="text-[10px] text-[var(--color-deletions)] ml-2 truncate">{mergeError || closeError}</span>
      )}

      <div className="flex-1" />
      <a href={pr.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 h-[26px] px-2 rounded-[var(--radius-sm)] text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer">
        <Icon icon="lucide:external-link" width={11} height={11} /> GitHub
      </a>
    </div>
  )
}

// ─── Workflow Tab (CodeFlow-style Maintainer flow) ─────────────

function WorkflowTab({
  pr,
  findings,
  reviewSummary,
  checksSummary,
  workflow,
  onOpenFindings,
}: {
  pr: PullRequestSummary
  findings: { all: Array<{ id: string; author: string; body: string; createdAt: string; source: string; severity: FindingSeverity }>; counts: Record<FindingSeverity, number> }
  reviewSummary: { approved: number; changesRequested: number; total: number }
  checksSummary: { passed: number; failed: number; pending: number; total: number }
  workflow: {
    reviewReady: boolean
    prepareReady: boolean
    mergeReady: boolean
    hasApproval: boolean
    checksGreen: boolean
    verdict: 'ready' | 'needs-work' | 'needs-discussion'
    blockers: string[]
  }
  onOpenFindings: (focusBlockers: boolean) => void
}) {
  const phase = [
    { key: 'review-pr', label: 'Review', ready: workflow.reviewReady, hint: workflow.reviewReady ? 'Findings triaged' : 'Resolve BLOCKER findings' },
    { key: 'prepare-pr', label: 'Prepare', ready: workflow.prepareReady, hint: workflow.prepareReady ? 'Ready for gates + changelog' : 'Resolve IMPORTANT findings & draft state' },
    { key: 'merge-pr', label: 'Merge', ready: workflow.mergeReady, hint: workflow.mergeReady ? 'Ready to merge' : 'Need approvals + green checks' },
  ] as const

  const verdictTone = workflow.verdict === 'ready'
    ? 'text-[var(--color-additions)] bg-[color-mix(in_srgb,var(--color-additions)_12%,transparent)]'
    : workflow.verdict === 'needs-work'
      ? 'text-[var(--color-deletions)] bg-[color-mix(in_srgb,var(--color-deletions)_12%,transparent)]'
      : 'text-[var(--warning,#eab308)] bg-[color-mix(in_srgb,var(--warning,#eab308)_12%,transparent)]'

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
        <div className="flex items-center gap-2 mb-2">
          <Icon icon="lucide:workflow" width={13} height={13} className="text-[var(--brand)]" />
          <span className="text-[11px] font-semibold text-[var(--text-primary)]">OpenClaw Maintainer Workflow</span>
          <span className={`ml-auto px-2 h-[20px] rounded-full text-[9px] font-semibold leading-[20px] ${verdictTone}`}>
            {workflow.verdict === 'ready' ? 'READY FOR PREPARE/MERGE' : workflow.verdict === 'needs-work' ? 'NEEDS WORK' : 'NEEDS DISCUSSION'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {phase.map((p, idx) => (
            <div key={p.key} className={`rounded-md border p-2 ${p.ready ? 'border-[color-mix(in_srgb,var(--color-additions)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-additions)_8%,transparent)]' : 'border-[var(--border)] bg-[var(--bg-elevated)]'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon icon={p.ready ? 'lucide:circle-check' : 'lucide:circle'} width={11} height={11} className={p.ready ? 'text-[var(--color-additions)]' : 'text-[var(--text-disabled)]'} />
                <span className="text-[10px] font-semibold text-[var(--text-primary)]">{idx + 1}. {p.label}</span>
              </div>
              <p className="text-[9px] text-[var(--text-tertiary)] leading-snug">{p.hint}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          <button
            onClick={() => onOpenFindings(findings.counts.BLOCKER > 0)}
            disabled={findings.all.length === 0}
            className={`h-[24px] px-2.5 rounded-[var(--radius-sm)] text-[10px] font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              findings.counts.BLOCKER > 0
                ? 'bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)] text-[var(--color-deletions)] hover:bg-[color-mix(in_srgb,var(--color-deletions)_18%,transparent)]'
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
            }`}
          >
            {findings.counts.BLOCKER > 0 ? 'Review blockers in conversation' : 'Review findings in conversation'}
          </button>
          <span className="ml-auto text-[9px] text-[var(--text-disabled)]">⇧B blocker · ⇧N next</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
          <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Findings</p>
          <div className="space-y-1.5">
            {(['BLOCKER', 'IMPORTANT', 'MINOR', 'NOTE'] as FindingSeverity[])
              .filter(s => findings.counts[s] > 0)
              .map(s => (
                <div key={s} className="flex items-center justify-between text-[10px]">
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${severityTone(s)}`}>{s}</span>
                  <span className="font-mono text-[var(--text-secondary)]">{findings.counts[s]}</span>
                </div>
              ))}
            {findings.all.length === 0 && (
              <p className="text-[10px] text-[var(--text-disabled)]">No tagged findings yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
          <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Merge Gates</p>
          <div className="space-y-1.5 text-[10px] text-[var(--text-secondary)]">
            <div className="flex items-center justify-between">
              <span>Approvals</span>
              <span className={workflow.hasApproval ? 'text-[var(--color-additions)] font-semibold' : 'text-[var(--warning,#eab308)] font-semibold'}>{reviewSummary.approved} approved</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Checks</span>
              <span className={workflow.checksGreen ? 'text-[var(--color-additions)] font-semibold' : 'text-[var(--warning,#eab308)] font-semibold'}>{checksSummary.passed}/{checksSummary.total} passing</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Draft state</span>
              <span className={pr.draft ? 'text-[var(--warning,#eab308)] font-semibold' : 'text-[var(--color-additions)] font-semibold'}>{pr.draft ? 'Draft' : 'Ready'}</span>
            </div>
          </div>
        </div>
      </div>

      {workflow.blockers.length > 0 && (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--warning,#eab308)_25%,transparent)] bg-[color-mix(in_srgb,var(--warning,#eab308)_10%,transparent)] p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Icon icon="lucide:triangle-alert" width={12} height={12} className="text-[var(--warning,#eab308)]" />
            <span className="text-[10px] font-semibold text-[var(--warning,#eab308)] uppercase tracking-wider">Next actions before merge</span>
          </div>
          <ul className="space-y-1">
            {workflow.blockers.map((b, i) => (
              <li key={i} className="text-[11px] text-[var(--text-secondary)] leading-snug">• {b}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Files Tab ─────────────────────────────────────────────────

function FilesTab({ files, loading, onFileSelect }: { files: PullRequestFile[]; loading: boolean; onFileSelect: (f: PullRequestFile) => void }) {
  if (loading) return <div className="py-12 text-center"><Icon icon="lucide:loader" width={16} height={16} className="mx-auto animate-spin text-[var(--brand)]" /></div>
  if (files.length === 0) return <div className="py-12 text-center"><p className="text-[11px] text-[var(--text-disabled)]">No files changed</p></div>
  return (
    <>
      <div className="flex items-center h-[28px] px-4 border-b border-[var(--border)] bg-[var(--bg)]">
        <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{files.length} file{files.length !== 1 ? 's' : ''} changed</span>
      </div>
      {files.map(f => (
        <button key={f.filename} onClick={() => onFileSelect(f)} className="w-full text-left flex items-center gap-2 px-4 h-[30px] hover:bg-[var(--bg-subtle)] cursor-pointer border-b border-[var(--border)] transition-colors">
          <Icon icon={f.status === 'added' ? 'lucide:plus' : f.status === 'removed' ? 'lucide:minus' : f.status === 'renamed' ? 'lucide:arrow-right' : 'lucide:pencil'} width={10} height={10} className={f.status === 'added' ? 'text-[var(--color-additions)]' : f.status === 'removed' ? 'text-[var(--color-deletions)]' : 'text-[var(--warning,#eab308)]'} />
          <span className="text-[11px] font-mono text-[var(--text-secondary)] truncate flex-1">{f.previous_filename ? `${f.previous_filename} → ${f.filename}` : f.filename}</span>
          <span className="text-[9px] font-mono text-[var(--color-additions)]">+{f.additions}</span>
          <span className="text-[9px] font-mono text-[var(--color-deletions)]">-{f.deletions}</span>
        </button>
      ))}
    </>
  )
}

// ─── Conversation Tab ──────────────────────────────────────────

function ConversationTab({ comments, reviewComments, loading, newComment, posting, onNewCommentChange, onPost, prState, findings, findingsOnly, onFindingsOnlyChange, highlightFindingId, onHighlightConsumed }: {
  comments: IssueComment[]; reviewComments: ReviewComment[]; loading: boolean
  newComment: string; posting: boolean; onNewCommentChange: (v: string) => void; onPost: () => void
  prState: string
  findings: { all: Array<{ id: string; author: string; body: string; createdAt: string; source: string; severity: FindingSeverity }>; counts: Record<FindingSeverity, number> }
  findingsOnly: boolean
  onFindingsOnlyChange: (v: boolean) => void
  highlightFindingId: string | null
  onHighlightConsumed: () => void
}) {
  const allItems = useMemo(() => {
    const items: Array<
      | { id: string; type: 'comment'; data: IssueComment; severity: FindingSeverity | null }
      | { id: string; type: 'review_comment'; data: ReviewComment; severity: FindingSeverity | null }
    > = [
      ...comments.map(c => ({ id: `issue-${c.id}`, type: 'comment' as const, data: c, severity: extractSeverity(c.body) })),
      ...reviewComments.filter(rc => !rc.in_reply_to_id).map(rc => ({ id: `review-comment-${rc.id}`, type: 'review_comment' as const, data: rc, severity: extractSeverity(rc.body) })),
    ]
    items.sort((a, b) => new Date(a.data.created_at).getTime() - new Date(b.data.created_at).getTime())
    return findingsOnly ? items.filter(i => !!i.severity) : items
  }, [comments, reviewComments, findingsOnly])

  const repliesByParent = useMemo(() => {
    const map = new Map<number, ReviewComment[]>()
    reviewComments
      .filter(rc => !!rc.in_reply_to_id)
      .forEach(rc => {
        const parent = rc.in_reply_to_id as number
        const list = map.get(parent) || []
        list.push(rc)
        map.set(parent, list)
      })
    for (const [, list] of map) {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }
    return map
  }, [reviewComments])

  const [expandedBodies, setExpandedBodies] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!highlightFindingId) return
    const el = document.getElementById(`finding-${highlightFindingId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-[var(--brand)]')
      setTimeout(() => el.classList.remove('ring-2', 'ring-[var(--brand)]'), 1400)
    }
    onHighlightConsumed()
  }, [highlightFindingId, onHighlightConsumed])

  if (loading) return <div className="py-12 text-center"><Icon icon="lucide:loader" width={16} height={16} className="mx-auto animate-spin text-[var(--brand)]" /></div>

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {findings.all.length > 0 && (
          <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center gap-2 mb-2">
              <Icon icon="lucide:shield-alert" width={12} height={12} className="text-[var(--brand)]" />
              <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Maintainer Findings</span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => onFindingsOnlyChange(false)}
                  className={`h-[20px] px-2 rounded-[var(--radius-sm)] text-[9px] cursor-pointer ${!findingsOnly ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]' : 'text-[var(--text-disabled)] hover:bg-[var(--bg-subtle)]'}`}
                >
                  All
                </button>
                <button
                  onClick={() => onFindingsOnlyChange(true)}
                  className={`h-[20px] px-2 rounded-[var(--radius-sm)] text-[9px] cursor-pointer ${findingsOnly ? 'bg-[var(--brand)] text-[var(--brand-contrast)]' : 'text-[var(--text-disabled)] hover:bg-[var(--bg-subtle)]'}`}
                >
                  Findings only
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['BLOCKER', 'IMPORTANT', 'MINOR', 'NOTE'] as FindingSeverity[])
                .filter(s => findings.counts[s] > 0)
                .map(s => (
                  <span key={s} className={`px-1.5 h-[18px] rounded-full border text-[9px] font-semibold leading-[16px] ${severityTone(s)}`}>
                    {s} · {findings.counts[s]}
                  </span>
                ))}
              {findings.all.length === 0 && (
                <span className="text-[9px] text-[var(--text-disabled)]">No findings tagged</span>
              )}
            </div>
          </div>
        )}

        {allItems.length === 0 ? (
          <div className="py-12 text-center">
            <Icon icon="lucide:message-circle" width={28} height={28} className="mx-auto mb-2 opacity-20" />
            <p className="text-[11px] text-[var(--text-tertiary)]">{findingsOnly ? 'No findings-tagged comments' : 'No comments yet'}</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {allItems.map(item => {
              if (item.type === 'comment') {
                const c = item.data
                return (
                  <div key={item.id} id={`finding-${item.id}`} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      {c.user.avatar_url && (
                        <img src={c.user.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                      )}
                      <span className="text-[11px] font-semibold text-[var(--text-primary)]">{c.user.login}</span>
                      {c.author_association && c.author_association !== 'NONE' && (
                        <span className="px-1.5 h-[16px] text-[8px] font-semibold rounded-full bg-[var(--bg-subtle)] text-[var(--text-disabled)] uppercase leading-[16px]">{c.author_association}</span>
                      )}
                      <span className="text-[9px] text-[var(--text-disabled)]">{timeAgo(c.created_at)}</span>
                      {item.severity && (
                        <span className={`px-1.5 h-[16px] rounded-full border text-[8px] font-semibold leading-[14px] ${severityTone(item.severity)}`}>
                          {item.severity}
                        </span>
                      )}
                    </div>
                    <div className="ml-7">
                      <div className={`${!expandedBodies[item.id] && c.body.length > 700 ? 'max-h-[180px] overflow-hidden relative' : ''}`}>
                        <MarkdownPreview content={c.body} className="text-[11px] text-[var(--text-secondary)] leading-relaxed" />
                        {!expandedBodies[item.id] && c.body.length > 700 && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--bg-elevated)] to-transparent" />}
                      </div>
                      {c.body.length > 700 && (
                        <button
                          onClick={() => setExpandedBodies(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                          className="mt-1 text-[10px] text-[var(--brand)] hover:opacity-80 cursor-pointer"
                        >
                          {expandedBodies[item.id] ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              }
              const rc = item.data
              return (
                <div key={item.id} id={`finding-${item.id}`} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    {rc.user.avatar_url && <img src={rc.user.avatar_url} alt="" className="w-5 h-5 rounded-full" />}
                    <span className="text-[11px] font-semibold text-[var(--text-primary)]">{rc.user.login}</span>
                    <span className="text-[9px] text-[var(--text-disabled)]">{timeAgo(rc.created_at)}</span>
                    <span className="text-[9px] font-mono text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-1 rounded">{rc.path}</span>
                    {item.severity && (
                      <span className={`px-1.5 h-[16px] rounded-full border text-[8px] font-semibold leading-[14px] ${severityTone(item.severity)}`}>
                        {item.severity}
                      </span>
                    )}
                  </div>
                  {rc.diff_hunk && (
                    <pre className="text-[10px] text-[var(--text-disabled)] font-mono bg-[var(--bg-subtle)] rounded-[var(--radius-sm)] p-2 mb-1.5 ml-7 overflow-x-auto max-h-[80px]">{rc.diff_hunk.split('\n').slice(-3).join('\n')}</pre>
                  )}
                  <div className="ml-7">
                    <div className={`${!expandedBodies[item.id] && rc.body.length > 700 ? 'max-h-[180px] overflow-hidden relative' : ''}`}>
                      <MarkdownPreview content={rc.body} className="text-[11px] text-[var(--text-secondary)] leading-relaxed" />
                      {!expandedBodies[item.id] && rc.body.length > 700 && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--bg-elevated)] to-transparent" />}
                    </div>
                    {rc.body.length > 700 && (
                      <button
                        onClick={() => setExpandedBodies(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                        className="mt-1 text-[10px] text-[var(--brand)] hover:opacity-80 cursor-pointer"
                      >
                        {expandedBodies[item.id] ? 'Show less' : 'Show more'}
                      </button>
                    )}

                    {(repliesByParent.get(rc.id) || []).map(reply => (
                      <div key={reply.id} className="mt-2 ml-3 pl-3 border-l border-[var(--border)]">
                        <div className="flex items-center gap-2 mb-1">
                          {reply.user.avatar_url && <img src={reply.user.avatar_url} alt="" className="w-4 h-4 rounded-full" />}
                          <span className="text-[10px] font-semibold text-[var(--text-primary)]">{reply.user.login}</span>
                          <span className="text-[9px] text-[var(--text-disabled)]">{timeAgo(reply.created_at)}</span>
                        </div>
                        <MarkdownPreview content={reply.body} className="text-[10px] text-[var(--text-secondary)] leading-relaxed" />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Comment input */}
      {prState === 'open' && (
        <div className="border-t border-[var(--border)] bg-[var(--bg)] p-3 shrink-0">
          <textarea
            value={newComment}
            onChange={e => onNewCommentChange(e.target.value)}
            placeholder="Leave a comment..."
            rows={3}
            className="w-full px-2.5 py-2 text-[11px] rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none resize-y focus:border-[var(--border-focus)] transition-colors leading-relaxed font-sans min-h-[60px]"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onPost() }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[9px] text-[var(--text-disabled)]">Ctrl+Enter to submit</span>
            <button
              onClick={onPost}
              disabled={!newComment.trim() || posting}
              className={`flex items-center gap-1 h-[26px] px-3 rounded-[var(--radius-sm)] text-[10px] font-semibold transition-all cursor-pointer ${
                newComment.trim() && !posting
                  ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)]'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'
              }`}
            >
              {posting ? <Icon icon="lucide:loader" width={10} height={10} className="animate-spin" /> : <Icon icon="lucide:send" width={10} height={10} />}
              Comment
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Reviews Tab ───────────────────────────────────────────────

function ReviewsTab({ reviews, loading }: { reviews: PRReview[]; loading: boolean }) {
  const meaningful = reviews.filter(r => r.state !== 'PENDING')

  if (loading) return <div className="py-12 text-center"><Icon icon="lucide:loader" width={16} height={16} className="mx-auto animate-spin text-[var(--brand)]" /></div>
  if (meaningful.length === 0) return (
    <div className="py-12 text-center">
      <Icon icon="lucide:eye" width={28} height={28} className="mx-auto mb-2 opacity-20" />
      <p className="text-[11px] text-[var(--text-tertiary)]">No reviews yet</p>
    </div>
  )

  const stateConfig: Record<string, { icon: string; color: string; label: string }> = {
    APPROVED: { icon: 'lucide:check-circle-2', color: 'text-[var(--color-additions)]', label: 'Approved' },
    CHANGES_REQUESTED: { icon: 'lucide:alert-circle', color: 'text-[var(--warning,#eab308)]', label: 'Changes requested' },
    COMMENTED: { icon: 'lucide:message-circle', color: 'text-[var(--text-tertiary)]', label: 'Commented' },
    DISMISSED: { icon: 'lucide:x-circle', color: 'text-[var(--text-disabled)]', label: 'Dismissed' },
  }

  return (
    <div className="divide-y divide-[var(--border)]">
      {meaningful.map(r => {
        const cfg = stateConfig[r.state] || stateConfig.COMMENTED
        return (
          <div key={r.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              {r.user.avatar_url && <img src={r.user.avatar_url} alt="" className="w-5 h-5 rounded-full" />}
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">{r.user.login}</span>
              <span className={`flex items-center gap-1 text-[10px] font-medium ${cfg.color}`}>
                <Icon icon={cfg.icon} width={12} height={12} />
                {cfg.label}
              </span>
              <span className="text-[9px] text-[var(--text-disabled)] ml-auto">{timeAgo(r.submitted_at)}</span>
            </div>
            {r.body && (
              <div className="ml-7 mt-1.5">
                <MarkdownPreview content={r.body} className="text-[11px] text-[var(--text-secondary)] leading-relaxed" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Checks Tab ────────────────────────────────────────────────

function ChecksTab({ checks, loading }: { checks: CheckRun[]; loading: boolean }) {
  if (loading) return <div className="py-12 text-center"><Icon icon="lucide:loader" width={16} height={16} className="mx-auto animate-spin text-[var(--brand)]" /></div>
  if (checks.length === 0) return (
    <div className="py-12 text-center">
      <Icon icon="lucide:circle-check" width={28} height={28} className="mx-auto mb-2 opacity-20" />
      <p className="text-[11px] text-[var(--text-tertiary)]">No checks configured</p>
    </div>
  )

  const checkIcon = (c: CheckRun) => {
    if (c.status !== 'completed') return { icon: 'lucide:clock', color: 'text-[var(--warning,#eab308)]' }
    switch (c.conclusion) {
      case 'success': return { icon: 'lucide:check-circle-2', color: 'text-[var(--color-additions)]' }
      case 'failure': case 'timed_out': case 'action_required': return { icon: 'lucide:x-circle', color: 'text-[var(--color-deletions)]' }
      case 'cancelled': return { icon: 'lucide:ban', color: 'text-[var(--text-disabled)]' }
      case 'skipped': case 'neutral': return { icon: 'lucide:minus-circle', color: 'text-[var(--text-tertiary)]' }
      default: return { icon: 'lucide:help-circle', color: 'text-[var(--text-disabled)]' }
    }
  }

  return (
    <div className="divide-y divide-[var(--border)]">
      {checks.map(c => {
        const ci = checkIcon(c)
        return (
          <div key={c.id} className="flex items-center gap-3 px-4 h-[36px] hover:bg-[var(--bg-subtle)] transition-colors">
            <Icon icon={ci.icon} width={14} height={14} className={ci.color} />
            <span className="text-[11px] font-medium text-[var(--text-primary)] flex-1 truncate">{c.name}</span>
            {c.status !== 'completed' && (
              <span className="text-[9px] text-[var(--warning,#eab308)] font-medium capitalize">{c.status.replace('_', ' ')}</span>
            )}
            {c.conclusion && (
              <span className={`text-[9px] font-medium capitalize ${ci.color}`}>{c.conclusion.replace('_', ' ')}</span>
            )}
            {c.html_url && (
              <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors">
                <Icon icon="lucide:external-link" width={10} height={10} />
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Create PR Form ────────────────────────────────────────────

function CreatePrForm({ branches, defaultHead, defaultBase, head, base, title, body, draft, creating, error, onHeadChange, onBaseChange, onTitleChange, onBodyChange, onDraftChange, onCancel, onCreate }: {
  branches: string[]; defaultHead: string; defaultBase: string
  head: string; base: string; title: string; body: string; draft: boolean
  creating: boolean; error: string | null
  onHeadChange: (v: string) => void; onBaseChange: (v: string) => void
  onTitleChange: (v: string) => void; onBodyChange: (v: string) => void
  onDraftChange: (v: boolean) => void; onCancel: () => void; onCreate: () => void
}) {
  const canCreate = title.trim() && head && base && head !== base && !creating
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 h-[34px] px-4 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
        <button onClick={onCancel} className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors">
          <Icon icon="lucide:arrow-left" width={14} height={14} />
        </button>
        <Icon icon="lucide:git-pull-request-create-arrow" width={13} height={13} className="text-[var(--brand)]" />
        <span className="text-[11px] font-semibold text-[var(--text-primary)] tracking-tight">New Pull Request</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-[520px] space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Head branch</label>
              <select value={head} onChange={e => onHeadChange(e.target.value)} className="w-full h-[32px] px-2.5 text-[11px] font-mono rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] transition-colors cursor-pointer appearance-none">
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <Icon icon="lucide:arrow-right" width={14} height={14} className="text-[var(--text-disabled)] mt-5" />
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Base branch</label>
              <select value={base} onChange={e => onBaseChange(e.target.value)} className="w-full h-[32px] px-2.5 text-[11px] font-mono rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] transition-colors cursor-pointer appearance-none">
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          {head === base && head && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--warning,#eab308)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning,#eab308)_25%,transparent)]">
              <Icon icon="lucide:alert-triangle" width={12} height={12} className="text-[var(--warning,#eab308)]" />
              <span className="text-[10px] text-[var(--warning,#eab308)]">Head and base branches must be different</span>
            </div>
          )}
          <div>
            <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Title</label>
            <input type="text" value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Describe your changes..." className="w-full h-[32px] px-2.5 text-[12px] rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)] transition-colors" onKeyDown={e => { if (e.key === 'Enter' && canCreate) onCreate() }} autoFocus />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Description</label>
            <textarea value={body} onChange={e => onBodyChange(e.target.value)} placeholder="Add a description..." rows={6} className="w-full px-2.5 py-2 text-[11px] rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none resize-y focus:border-[var(--border-focus)] transition-colors leading-relaxed font-sans min-h-[100px]" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={draft} onChange={e => onDraftChange(e.target.checked)} className="accent-[var(--brand)] w-3.5 h-3.5" />
            <span className="text-[11px] text-[var(--text-secondary)]">Create as draft</span>
          </label>
          {error && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-deletions)_25%,transparent)]">
              <Icon icon="lucide:alert-circle" width={12} height={12} className="text-[var(--color-deletions)]" />
              <span className="text-[10px] text-[var(--color-deletions)]">{error}</span>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={onCreate} disabled={!canCreate} className={`flex items-center gap-1.5 h-[32px] px-4 rounded-[var(--radius-sm)] text-[11px] font-semibold transition-all cursor-pointer ${canCreate ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)] shadow-[var(--shadow-sm)]' : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'}`}>
              {creating ? (<><Icon icon="lucide:loader" width={12} height={12} className="animate-spin" /> Creating...</>) : (<><Icon icon="lucide:git-pull-request-create-arrow" width={12} height={12} /> Create Pull Request</>)}
            </button>
            <button onClick={onCancel} className="h-[32px] px-3 rounded-[var(--radius-sm)] text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Diff Viewer ───────────────────────────────────────────────

function DiffViewer({ file, onBack }: { file: PullRequestFile; onBack: () => void }) {
  const media = detectMedia(file.filename)
  const fileIcon = media === 'image' ? 'lucide:image' : media === 'video' ? 'lucide:video' : media === 'audio' ? 'lucide:music' : 'lucide:file-diff'
  return (
    <>
      <div className="flex items-center gap-2 h-[34px] px-4 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
        <button onClick={onBack} className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors">
          <Icon icon="lucide:arrow-left" width={14} height={14} />
        </button>
        <Icon icon={fileIcon} width={12} height={12} className="text-[var(--text-tertiary)]" />
        <span className="text-[11px] font-mono font-medium text-[var(--text-primary)] truncate">{file.filename}</span>
        <div className="flex-1" />
        {!media && (
          <>
            <span className="text-[10px] font-mono text-[var(--color-additions)] font-medium">+{file.additions}</span>
            <span className="text-[10px] font-mono text-[var(--color-deletions)] font-medium">-{file.deletions}</span>
          </>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {media ? (
          <MediaPreview filename={file.filename} url={file.raw_url} />
        ) : file.patch ? (
          <pre className="p-3 text-[var(--text-secondary)] font-mono text-[11px] leading-[1.6]">
            {file.patch.split('\n').map((line, i) => (
              <div key={i} className={
                line.startsWith('+') && !line.startsWith('+++') ? 'bg-[color-mix(in_srgb,var(--color-additions)_10%,transparent)] text-[var(--color-additions)]'
                : line.startsWith('-') && !line.startsWith('---') ? 'bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)] text-[var(--color-deletions)]'
                : line.startsWith('@@') ? 'text-[var(--brand)] font-semibold opacity-80' : ''
              }>{line}</div>
            ))}
          </pre>
        ) : (
          <div className="p-4 text-center text-[var(--text-disabled)] text-[11px]">Binary file</div>
        )}
      </div>
    </>
  )
}
