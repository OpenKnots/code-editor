'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useRepo } from '@/context/repo-context'
import { useGateway } from '@/context/gateway-context'
import { useLocal } from '@/context/local-context'
import { useEditor } from '@/context/editor-context'
import {
  commitFilesByName as commitFiles,
  fetchBranchesByName,
  createBranch,
  authHeaders,
} from '@/lib/github-api'
import { computeDiff, type DiffLine } from '@/lib/diff'
import { useView } from '@/context/view-context'
import { CODE_EDITOR_SESSION_KEY } from '@/lib/agent-session'
import {
  buildEditorPatchSnippet,
  generateCommitMessageWithGateway,
  type CommitMessageChange,
} from '@/lib/gateway-commit-message'

const BRANCH_PAGE_SIZE = 10

type MediaKind = 'image' | 'video' | 'audio' | null

function detectMedia(filename: string): MediaKind {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(ext))
    return 'image'
  if (['mp4', 'webm', 'ogv', 'mov', 'm4v'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio'
  return null
}

function CommitMediaPreview({ filename, url }: { filename: string; url?: string }) {
  const kind = detectMedia(filename)
  const name = filename.split('/').pop() ?? filename

  if (!url) {
    return (
      <div className="h-full w-full flex items-center justify-center p-6 bg-[var(--bg-subtle)]">
        <div className="text-center text-[var(--text-tertiary)]">
          <Icon
            icon={
              kind === 'image' ? 'lucide:image' : kind === 'video' ? 'lucide:video' : 'lucide:music'
            }
            width={32}
            height={32}
            className="mx-auto mb-2 opacity-40"
          />
          <p className="text-[12px] font-medium">{name}</p>
          <p className="text-[10px] text-[var(--text-disabled)] mt-1">Preview unavailable</p>
        </div>
      </div>
    )
  }

  if (kind === 'image') {
    return (
      <div className="h-full w-full flex items-center justify-center p-6 bg-[var(--bg-subtle)] overflow-auto">
        <div className="flex flex-col items-center gap-3">
          <img
            src={url}
            alt={name}
            className="max-w-full max-h-[60vh] object-contain rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-sm"
          />
          <span className="text-[10px] text-[var(--text-disabled)] font-mono">{name}</span>
        </div>
      </div>
    )
  }

  if (kind === 'video') {
    return (
      <div className="h-full w-full flex items-center justify-center p-6 bg-[var(--bg-subtle)] overflow-auto">
        <div className="flex flex-col items-center gap-3 w-full max-w-[720px]">
          <video
            src={url}
            controls
            className="max-w-full max-h-[60vh] rounded-lg border border-[var(--border)] bg-black shadow-sm"
          />
          <span className="text-[10px] text-[var(--text-disabled)] font-mono">{name}</span>
        </div>
      </div>
    )
  }

  if (kind === 'audio') {
    return (
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
  }

  return null
}

interface ChangeEntry {
  path: string
  status: string // 'M', 'A', 'D', '??', 'R', 'editor'
  source: 'git' | 'editor'
  index_status?: string // first char of porcelain XY (staged state)
  worktree_status?: string // second char of porcelain XY (working-tree state)
}

export function GitView() {
  const { repo } = useRepo()
  const { sendRequest, onEvent, status: gatewayStatus } = useGateway()
  const local = useLocal()
  const { files, markClean } = useEditor()
  const { goBack, setView } = useView()

  const isLocalMode = local.localMode && local.rootPath && local.gitInfo?.is_repo

  const [tab, setTab] = useState<'changes' | 'history'>('changes')
  const [commitMsg, setCommitMsg] = useState('')
  const [commitDesc, setCommitDesc] = useState('')
  const [showDesc, setShowDesc] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [generatingCommitMsg, setGeneratingCommitMsg] = useState(false)
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [localDiffPatch, setLocalDiffPatch] = useState<string | null>(null)

  const [commits, setCommits] = useState<
    Array<{ sha: string; shortSha: string; message: string; author: string; date: string }>
  >([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<{
    sha: string
    shortSha: string
    message: string
    author: string
    date: string
  } | null>(null)
  const [commitFilesData, setCommitFilesData] = useState<
    Array<{
      filename: string
      status: string
      additions: number
      deletions: number
      patch?: string
      raw_url?: string
    }>
  >([])
  const [activeCommitFile, setActiveCommitFile] = useState<{
    filename: string
    patch?: string
    additions: number
    deletions: number
    raw_url?: string
  } | null>(null)

  const [branches, setBranches] = useState<string[]>([])
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [branchFilter, setBranchFilter] = useState('')
  const [branchLimit, setBranchLimit] = useState(BRANCH_PAGE_SIZE)
  const [branchSwitchError, setBranchSwitchError] = useState<string | null>(null)
  const [undoingCommit, setUndoingCommit] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [pushSuccess, setPushSuccess] = useState(false)

  const commitInputRef = useRef<HTMLInputElement>(null)
  const branchMenuRef = useRef<HTMLDivElement>(null)

  const branchName = repo?.branch ?? local.gitInfo?.branch ?? 'main'
  const dirtyFiles = useMemo(() => files.filter((f) => f.dirty && f.kind === 'text'), [files])

  const changeEntries = useMemo<ChangeEntry[]>(() => {
    if (isLocalMode) {
      const gitStatus = local.gitInfo?.status ?? []
      const entries: ChangeEntry[] = gitStatus.map((s) => ({
        path: s.path,
        status: s.status,
        source: 'git' as const,
        index_status: s.index_status,
        worktree_status: s.worktree_status,
      }))
      for (const f of dirtyFiles) {
        if (!gitStatus.some((s) => s.path === f.path)) {
          entries.push({ path: f.path, status: 'editor', source: 'editor' })
        }
      }
      return entries
    }
    return dirtyFiles.map((f) => ({ path: f.path, status: 'M', source: 'editor' as const }))
  }, [isLocalMode, local.gitInfo?.status, dirtyFiles])

  useEffect(() => {
    if (repo)
      fetchBranchesByName(repo.fullName)
        .then((bs) => setBranches(bs.map((b) => b.name)))
        .catch(() => {})
  }, [repo])

  useEffect(() => {
    if (!showBranchMenu) return
    const handler = (e: MouseEvent) => {
      if (branchMenuRef.current && !branchMenuRef.current.contains(e.target as Node)) {
        setShowBranchMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBranchMenu])

  useEffect(() => {
    if (showBranchMenu) {
      setBranchLimit(BRANCH_PAGE_SIZE)
      setBranchFilter('')
      setBranchSwitchError(null)
    }
  }, [showBranchMenu])

  // Load local diff when selecting a git-status file
  useEffect(() => {
    if (!activeFilePath || !isLocalMode) {
      setLocalDiffPatch(null)
      return
    }
    const entry = changeEntries.find((e) => e.path === activeFilePath)
    if (entry?.source === 'git') {
      const isStaged = entry.index_status !== ' ' && entry.index_status !== '?'
      const hasWorktreeChanges = entry.worktree_status !== ' '
      // Show staged diff if only staged, otherwise working-tree diff
      const showStaged = isStaged && !hasWorktreeChanges
      local
        .getDiff(activeFilePath, showStaged)
        .then((d) => setLocalDiffPatch(d || null))
        .catch(() => setLocalDiffPatch(null))
    } else {
      setLocalDiffPatch(null)
    }
  }, [activeFilePath, isLocalMode, changeEntries, local])

  const activeDiff = useMemo(() => {
    const file = files.find((f) => f.path === activeFilePath)
    if (!file?.dirty) return null
    return { path: file.path, lines: computeDiff(file.originalContent, file.content) }
  }, [files, activeFilePath])

  const handleCommit = async () => {
    if (!commitMsg.trim() || changeEntries.length === 0) return
    setCommitting(true)
    setCommitError(null)
    try {
      if (isLocalMode) {
        const paths = changeEntries.map((e) => e.path)
        const msg = showDesc && commitDesc.trim() ? `${commitMsg}\n\n${commitDesc}` : commitMsg
        await local.commitFiles(msg, paths)
        paths.forEach((p) => {
          if (files.find((f) => f.path === p && f.dirty)) markClean(p)
        })
        setCommitMsg('')
        setCommitDesc('')
        setShowDesc(false)
      } else if (repo) {
        const msg = showDesc && commitDesc.trim() ? `${commitMsg}\n\n${commitDesc}` : commitMsg
        await commitFiles(
          repo.fullName,
          dirtyFiles.map((f) => ({ path: f.path, content: f.content, sha: f.sha })),
          msg,
          branchName,
        )
        dirtyFiles.forEach((f) => markClean(f.path))
        setCommitMsg('')
        setCommitDesc('')
        setShowDesc(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Commit failed:', msg)
      setCommitError(msg)
    }
    setCommitting(false)
  }

  const collectCommitChangesForGeneration = useCallback(async (): Promise<
    CommitMessageChange[]
  > => {
    const changes: CommitMessageChange[] = []
    const seenPaths = new Set<string>()

    for (const entry of changeEntries) {
      if (seenPaths.has(entry.path)) continue
      seenPaths.add(entry.path)

      if (isLocalMode && entry.source === 'git') {
        const indexStatus = entry.index_status ?? ' '
        const worktreeStatus = entry.worktree_status ?? ' '
        const hasStaged = indexStatus !== ' ' && indexStatus !== '?'
        const hasWorktree = worktreeStatus !== ' '
        const stagedOnly = hasStaged && !hasWorktree
        let patch = ''
        try {
          patch = await local.getDiff(entry.path, stagedOnly)
          if (!patch && hasStaged) patch = await local.getDiff(entry.path, true)
        } catch {}

        const summaryBits: string[] = []
        if (entry.status === '??') summaryBits.push('untracked')
        if (hasStaged) summaryBits.push('staged')
        if (hasWorktree) summaryBits.push('unstaged')

        changes.push({
          path: entry.path,
          status: entry.status || `${indexStatus}${worktreeStatus}`.trim() || 'M',
          summary: summaryBits.join(', ') || undefined,
          patch: patch || undefined,
        })
        continue
      }

      const file = files.find((f) => f.path === entry.path && f.kind === 'text')
      changes.push({
        path: entry.path,
        status: entry.status || 'M',
        summary: entry.source === 'editor' ? 'unsaved editor changes' : undefined,
        patch: file ? buildEditorPatchSnippet(file.originalContent, file.content) : undefined,
      })
    }

    return changes
  }, [changeEntries, files, isLocalMode, local])

  const handleGenerateCommitMessage = useCallback(async () => {
    if (changeEntries.length === 0) {
      setCommitError('No changes detected to summarize.')
      return
    }
    if (gatewayStatus !== 'connected') {
      setCommitError('Gateway disconnected — cannot generate commit message.')
      return
    }

    setGeneratingCommitMsg(true)
    setCommitError(null)
    try {
      const changes = await collectCommitChangesForGeneration()
      if (changes.length === 0) {
        setCommitError('No changes detected to summarize.')
        return
      }

      const generated = await generateCommitMessageWithGateway({
        sendRequest,
        onEvent,
        sessionKey: CODE_EDITOR_SESSION_KEY,
        repoFullName: repo?.fullName ?? local.remoteRepo ?? undefined,
        branch: branchName,
        changes,
      })

      setCommitMsg(generated)
      commitInputRef.current?.focus()
    } catch (err) {
      setCommitError(`Generate failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGeneratingCommitMsg(false)
    }
  }, [
    changeEntries.length,
    gatewayStatus,
    collectCommitChangesForGeneration,
    sendRequest,
    onEvent,
    repo?.fullName,
    local.remoteRepo,
    branchName,
  ])

  const handleCreateBranch = async () => {
    if (isLocalMode) {
      if (!newBranchName.trim()) return
      setCreatingBranch(true)
      setBranchSwitchError(null)
      try {
        await local.switchBranch(newBranchName.trim())
        setNewBranchName('')
        setShowBranchMenu(false)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setBranchSwitchError(
          msg.includes('overwritten by checkout') ? 'Commit or stash changes first.' : msg,
        )
      }
      setCreatingBranch(false)
      return
    }

    if (!repo || !newBranchName.trim()) return
    setCreatingBranch(true)
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${repo.fullName}/git/ref/heads/${branchName}`,
        {
          headers: { ...authHeaders(), Accept: 'application/vnd.github.v3+json' },
        },
      )
      if (resp.ok) {
        const data = await resp.json()
        const ok = await createBranch(repo.fullName, newBranchName.trim(), data.object.sha)
        if (ok) {
          setBranches((prev) => [...prev, newBranchName.trim()])
          setNewBranchName('')
          setShowBranchMenu(false)
        }
      }
    } catch {}
    setCreatingBranch(false)
  }

  const handleSwitchBranch = useCallback(
    async (branch: string) => {
      if (branch === branchName) return
      if (isLocalMode) {
        setBranchSwitchError(null)
        try {
          await local.switchBranch(branch)
          setShowBranchMenu(false)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setBranchSwitchError(
            msg.includes('overwritten by checkout')
              ? 'Commit or stash your changes before switching branches.'
              : `Switch failed: ${msg}`,
          )
        }
      } else {
        setShowBranchMenu(false)
      }
    },
    [branchName, isLocalMode, local],
  )

  const [unstageError, setUnstageError] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const [discardConfirmPath, setDiscardConfirmPath] = useState<string | null>(null)
  const [discardConfirmSection, setDiscardConfirmSection] = useState<'changes' | 'staged' | null>(
    null,
  )
  const [gqStatus, setGqStatus] = useState<
    'saving' | 'syncing' | 'cleaning' | 'done' | 'error' | null
  >(null)
  const [gqMessage, setGqMessage] = useState<string | null>(null)

  const handleStageSingle = useCallback(
    async (path: string) => {
      if (!isLocalMode) return
      setUnstageError(null)
      try {
        await local.stageFiles([path])
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setUnstageError(msg)
        setTimeout(() => setUnstageError(null), 5000)
      }
    },
    [isLocalMode, local],
  )

  const handleUnstageSingle = useCallback(
    async (path: string) => {
      if (!isLocalMode) return
      setUnstageError(null)
      try {
        await local.unstageFiles([path])
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setUnstageError(msg)
        setTimeout(() => setUnstageError(null), 5000)
      }
    },
    [isLocalMode, local],
  )

  const handleDiscardAllChanges = useCallback(async () => {
    if (!local.discardChanges) return
    const paths = changeEntries
      .filter((e) => e.source === 'git' && (e.index_status === ' ' || e.index_status === '?'))
      .map((e) => e.path)
    if (paths.length === 0) return
    setDiscarding(true)
    try {
      await local.discardChanges(paths)
      setDiscardConfirmSection(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUnstageError(`Discard failed: ${msg}`)
      setTimeout(() => setUnstageError(null), 5000)
    } finally {
      setDiscarding(false)
    }
  }, [local, changeEntries])

  const handleDiscardAllStaged = useCallback(async () => {
    if (!local.discardStagedChanges) return
    const paths = changeEntries
      .filter((e) => e.source === 'git' && e.index_status !== ' ' && e.index_status !== '?')
      .map((e) => e.path)
    if (paths.length === 0) return
    setDiscarding(true)
    try {
      await local.discardStagedChanges(paths)
      setDiscardConfirmSection(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUnstageError(`Discard staged failed: ${msg}`)
      setTimeout(() => setUnstageError(null), 5000)
    } finally {
      setDiscarding(false)
    }
  }, [local, changeEntries])

  const handleDiscardSingle = useCallback(
    async (path: string, staged: boolean) => {
      setDiscarding(true)
      setUnstageError(null)
      try {
        if (staged) {
          await local.discardStagedChanges([path])
        } else {
          await local.discardChanges([path])
        }
        setDiscardConfirmPath(null)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setUnstageError(`Discard failed: ${msg}`)
        setTimeout(() => setUnstageError(null), 5000)
      } finally {
        setDiscarding(false)
      }
    },
    [local],
  )

  const handleUndoCommit = useCallback(async () => {
    if (!isLocalMode) return
    setUndoingCommit(true)
    setCommitError(null)
    try {
      await local.undoLastCommit()
      setConfirmUndo(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCommitError(`Undo failed: ${msg}`)
    }
    setUndoingCommit(false)
  }, [isLocalMode, local])

  const handlePush = useCallback(async () => {
    if (!isLocalMode) return
    setPushing(true)
    setPushError(null)
    setPushSuccess(false)
    try {
      await local.push()
      setPushSuccess(true)
      await local.refreshAheadBehind()
      setTimeout(() => setPushSuccess(false), 3000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPushError(msg)
    }
    setPushing(false)
  }, [isLocalMode, local])

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      if (isLocalMode) {
        const entries = await local.gitLog(30)
        setCommits(
          entries.map((e) => ({
            sha: e.hash,
            shortSha: e.hash.slice(0, 7),
            message: e.message,
            author: e.author,
            date: new Date(e.date).toLocaleDateString(),
          })),
        )
      } else if (repo) {
        const resp = await fetch(
          `https://api.github.com/repos/${repo.fullName}/commits?sha=${branchName}&per_page=30`,
          {
            headers: { ...authHeaders(), Accept: 'application/vnd.github.v3+json' },
          },
        )
        if (resp.ok) {
          const data = await resp.json()
          setCommits(
            data.map((c: any) => ({
              sha: c.sha,
              shortSha: c.sha.slice(0, 7),
              message: c.commit?.message?.split('\n')[0] ?? '',
              author: c.commit?.author?.name ?? 'Unknown',
              date: new Date(c.commit?.author?.date ?? '').toLocaleDateString(),
            })),
          )
        }
      }
    } catch {}
    setLoadingHistory(false)
  }, [isLocalMode, local, repo, branchName])

  const loadCommitFilesData = useCallback(
    async (commit: (typeof commits)[0]) => {
      setSelectedCommit(commit)
      setCommitFilesData([])
      setActiveCommitFile(null)
      if (!repo?.fullName) return
      try {
        const resp = await fetch(
          `https://api.github.com/repos/${repo.fullName}/commits/${commit.sha}`,
          {
            headers: { ...authHeaders(), Accept: 'application/vnd.github.v3+json' },
          },
        )
        if (resp.ok) {
          const data = await resp.json()
          setCommitFilesData(
            (data.files || []).map((f: any) => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch,
              raw_url: f.raw_url,
            })),
          )
        }
      } catch {}
    },
    [repo],
  )

  useEffect(() => {
    if (tab === 'history' && commits.length === 0) loadHistory()
  }, [tab, loadHistory, commits.length])

  // Use local branches when in local mode
  const effectiveBranches = isLocalMode ? local.branches : branches

  const filteredBranches = useMemo(
    () =>
      branchFilter
        ? effectiveBranches.filter((b) => b.toLowerCase().includes(branchFilter.toLowerCase()))
        : effectiveBranches,
    [effectiveBranches, branchFilter],
  )

  const sortedBranches = useMemo(() => {
    const sorted = [...filteredBranches].sort((a, b) => {
      if (a === branchName) return -1
      if (b === branchName) return 1
      return a.localeCompare(b)
    })
    return sorted
  }, [filteredBranches, branchName])

  const visibleBranches = useMemo(
    () => sortedBranches.slice(0, branchLimit),
    [sortedBranches, branchLimit],
  )
  const hasMoreBranches = sortedBranches.length > branchLimit

  const commitReady = commitMsg.trim() && changeEntries.length > 0 && !committing

  useEffect(() => {
    if (tab === 'changes' && changeEntries.length > 0 && !activeFilePath) {
      setActiveFilePath(changeEntries[0].path)
    }
  }, [tab, changeEntries, activeFilePath])

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left panel — source control (full-width on mobile) */}
      <div className="w-full sm:w-[300px] flex flex-col border-r border-[var(--border)] bg-[var(--bg)] shrink-0">
        {/* Header */}
        <div className="flex items-center gap-2 h-[34px] px-3 border-b border-[var(--border)] shrink-0">
          <button
            onClick={goBack}
            className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
            title="Back"
          >
            <Icon icon="lucide:arrow-left" width={14} height={14} />
          </button>
          <span className="text-[11px] font-semibold text-[var(--text-primary)] tracking-tight">
            Source Control
          </span>
          <div className="flex-1" />

          {/* Branch pill */}
          <div className="relative" ref={branchMenuRef}>
            <button
              onClick={() => setShowBranchMenu((v) => !v)}
              className="flex items-center gap-1 h-[22px] px-2 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] border border-[var(--border)] hover:border-[var(--border-hover)] cursor-pointer transition-colors"
            >
              <Icon
                icon="lucide:git-branch"
                width={10}
                height={10}
                className="text-[var(--brand)]"
              />
              <span className="text-[10px] font-mono font-medium text-[var(--text-secondary)] max-w-[100px] truncate">
                {branchName}
              </span>
              <Icon
                icon="lucide:chevron-down"
                width={8}
                height={8}
                className="text-[var(--text-disabled)]"
              />
            </button>

            {showBranchMenu && (
              <div className="absolute top-full right-0 mt-1 w-64 bg-[var(--bg-subtle)] border border-[var(--border-hover)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] z-50 overflow-hidden animate-scale-in">
                <div className="p-1.5 border-b border-[var(--border)]">
                  <div className="relative">
                    <Icon
                      icon="lucide:search"
                      width={11}
                      height={11}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]"
                    />
                    <input
                      type="text"
                      value={branchFilter}
                      onChange={(e) => {
                        setBranchFilter(e.target.value)
                        setBranchLimit(BRANCH_PAGE_SIZE)
                      }}
                      placeholder="Search branches..."
                      className="w-full h-[26px] pl-7 pr-2 text-[11px] rounded-[var(--radius-sm)] bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)] transition-colors"
                      autoFocus
                    />
                  </div>
                </div>
                {branchSwitchError && (
                  <div className="px-2.5 py-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)]">
                    <div className="flex items-start gap-1.5">
                      <Icon
                        icon="lucide:alert-triangle"
                        width={11}
                        height={11}
                        className="text-[var(--color-deletions)] shrink-0 mt-0.5"
                      />
                      <span className="text-[10px] text-[var(--color-deletions)] leading-snug">
                        {branchSwitchError}
                      </span>
                    </div>
                  </div>
                )}
                <div className="max-h-[220px] overflow-y-auto py-0.5">
                  {visibleBranches.length > 0 ? (
                    <>
                      {visibleBranches.map((b) => (
                        <button
                          key={b}
                          onClick={() => handleSwitchBranch(b)}
                          className={`w-full text-left px-3 h-[28px] text-[11px] font-mono hover:bg-[var(--bg-tertiary)] cursor-pointer flex items-center gap-2 transition-colors ${
                            b === branchName
                              ? 'text-[var(--brand)] font-semibold'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {b === branchName ? (
                            <Icon icon="lucide:check" width={10} height={10} className="shrink-0" />
                          ) : (
                            <span className="w-[10px] shrink-0" />
                          )}
                          <span className="truncate">{b}</span>
                          {b === branchName && (
                            <span className="ml-auto text-[8px] text-[var(--text-disabled)] font-sans font-normal uppercase tracking-wider shrink-0">
                              current
                            </span>
                          )}
                        </button>
                      ))}
                      {hasMoreBranches && (
                        <button
                          onClick={() => setBranchLimit((prev) => prev + BRANCH_PAGE_SIZE)}
                          className="w-full text-center h-[28px] text-[10px] font-medium text-[var(--brand)] hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors flex items-center justify-center gap-1"
                        >
                          <Icon icon="lucide:chevrons-down" width={10} height={10} />
                          Show more ({sortedBranches.length - branchLimit} remaining)
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="px-3 py-4 text-center text-[10px] text-[var(--text-disabled)]">
                      No branches matching &ldquo;{branchFilter}&rdquo;
                    </div>
                  )}
                </div>
                <div className="p-1.5 border-t border-[var(--border)]">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      placeholder="New branch name..."
                      className="flex-1 h-[26px] px-2 text-[11px] rounded-[var(--radius-sm)] bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)] transition-colors"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateBranch()
                      }}
                    />
                    <button
                      onClick={handleCreateBranch}
                      disabled={!newBranchName.trim() || creatingBranch}
                      className="h-[26px] px-2.5 text-[10px] font-medium rounded-[var(--radius-sm)] bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)] disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      {creatingBranch ? '...' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {tab === 'history' && (
            <button
              onClick={loadHistory}
              className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
              title="Refresh"
            >
              <Icon
                icon="lucide:refresh-cw"
                width={12}
                height={12}
                className={loadingHistory ? 'animate-spin' : ''}
              />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center h-[30px] border-b border-[var(--border)] px-1.5 shrink-0 gap-0.5">
          {(['changes', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 h-[24px] px-2.5 text-[11px] font-medium rounded-[var(--radius-sm)] transition-colors cursor-pointer ${
                tab === t
                  ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <Icon
                icon={t === 'changes' ? 'lucide:file-diff' : 'lucide:history'}
                width={12}
                height={12}
              />
              {t === 'changes' ? 'Changes' : 'History'}
              {t === 'changes' && changeEntries.length > 0 && (
                <span className="ml-0.5 px-1 min-w-[16px] text-center rounded-full bg-[var(--brand)] text-[var(--brand-contrast)] text-[9px] font-bold leading-[16px]">
                  {changeEntries.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'changes' ? (
          <>
            {unstageError && (
              <div className="flex items-start gap-1.5 px-3 py-1.5 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)]">
                <Icon
                  icon="lucide:alert-circle"
                  width={11}
                  height={11}
                  className="text-[var(--color-deletions)] shrink-0 mt-0.5"
                />
                <span className="text-[10px] text-[var(--color-deletions)] leading-snug">
                  {unstageError}
                </span>
                <button
                  onClick={() => setUnstageError(null)}
                  className="ml-auto shrink-0 text-[var(--color-deletions)] hover:opacity-70 cursor-pointer"
                >
                  <Icon icon="lucide:x" width={10} height={10} />
                </button>
              </div>
            )}

            {/* Changed files list */}
            <div className="flex-1 overflow-y-auto">
              {(() => {
                const stagedEntries = isLocalMode
                  ? changeEntries.filter(
                      (e) => e.source === 'git' && e.index_status !== ' ' && e.index_status !== '?',
                    )
                  : []
                const unstagedEntries = isLocalMode
                  ? changeEntries.filter(
                      (e) =>
                        e.source === 'editor' || e.index_status === ' ' || e.index_status === '?',
                    )
                  : changeEntries

                const renderEntry = (entry: ChangeEntry, staged = false) => {
                  const fileName = entry.path.split('/').pop() ?? entry.path
                  const dirPath = entry.path.split('/').slice(0, -1).join('/')
                  const statusColor =
                    entry.status === 'D'
                      ? 'text-[var(--color-deletions)]'
                      : entry.status === 'A' || entry.status === '??'
                        ? 'text-[var(--color-additions)]'
                        : 'text-[var(--warning,#eab308)]'
                  const statusLabel =
                    entry.status === 'M'
                      ? 'M'
                      : entry.status === 'A'
                        ? 'A'
                        : entry.status === 'D'
                          ? 'D'
                          : entry.status === '??'
                            ? 'U'
                            : entry.status === 'R'
                              ? 'R'
                              : entry.status === 'editor'
                                ? 'E'
                                : entry.status
                  const statusTitle =
                    entry.status === 'M'
                      ? 'Modified'
                      : entry.status === 'A'
                        ? 'Added'
                        : entry.status === 'D'
                          ? 'Deleted'
                          : entry.status === '??'
                            ? 'Untracked'
                            : entry.status === 'R'
                              ? 'Renamed'
                              : entry.status === 'editor'
                                ? 'Editor changes (unsaved)'
                                : entry.status
                  const isConfirming = discardConfirmPath === entry.path

                  if (isConfirming) {
                    return (
                      <div
                        key={entry.path}
                        className="flex items-center gap-1.5 h-[30px] px-3 bg-[color-mix(in_srgb,var(--color-deletions)_6%,transparent)] border-b border-[color-mix(in_srgb,var(--color-deletions)_12%,transparent)]"
                      >
                        <Icon
                          icon="lucide:alert-triangle"
                          width={11}
                          height={11}
                          className="text-[var(--color-deletions)] shrink-0"
                        />
                        <span className="text-[10px] text-[var(--color-deletions)] truncate flex-1">
                          Discard changes to {fileName}?
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDiscardSingle(entry.path, staged)
                          }}
                          disabled={discarding}
                          className="h-[20px] px-2 text-[10px] font-medium rounded-[var(--radius-sm)] bg-[var(--color-deletions)] text-[var(--on-deletions)] hover:opacity-90 cursor-pointer transition-opacity disabled:opacity-50"
                        >
                          {discarding ? '...' : 'Discard'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDiscardConfirmPath(null)
                          }}
                          className="h-[20px] px-1.5 text-[10px] text-[var(--text-tertiary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={entry.path}
                      onClick={() => setActiveFilePath(entry.path)}
                      className={`group flex items-center gap-2 h-[30px] px-3 hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer ${
                        activeFilePath === entry.path
                          ? 'bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]'
                          : ''
                      }`}
                    >
                      <Icon
                        icon="lucide:file-code-2"
                        width={12}
                        height={12}
                        className="text-[var(--text-tertiary)] shrink-0"
                      />
                      <span className="text-[11px] font-mono text-[var(--text-primary)] truncate flex-1">
                        {fileName}
                      </span>
                      {dirPath && (
                        <span className="text-[10px] text-[var(--text-disabled)] truncate shrink-0 font-mono max-w-[80px] hidden group-hover:hidden xl:inline group-hover:xl:hidden">
                          {dirPath}
                        </span>
                      )}
                      {/* Inline action buttons — visible on hover */}
                      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        {!staged && isLocalMode && entry.source === 'git' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDiscardConfirmPath(entry.path)
                            }}
                            className="flex items-center justify-center w-[20px] h-[20px] rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--color-deletions)_12%,transparent)] text-[var(--text-disabled)] hover:text-[var(--color-deletions)] cursor-pointer transition-colors"
                            title="Discard changes"
                          >
                            <Icon icon="lucide:undo-2" width={12} height={12} />
                          </button>
                        )}
                        {staged && isLocalMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleUnstageSingle(entry.path)
                            }}
                            className="flex items-center justify-center w-[20px] h-[20px] rounded-[var(--radius-sm)] hover:bg-[var(--bg-elevated)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
                            title="Unstage"
                          >
                            <Icon icon="lucide:minus" width={12} height={12} />
                          </button>
                        )}
                        {!staged && isLocalMode && entry.source === 'git' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStageSingle(entry.path)
                            }}
                            className="flex items-center justify-center w-[20px] h-[20px] rounded-[var(--radius-sm)] hover:bg-[var(--bg-elevated)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
                            title="Stage"
                          >
                            <Icon icon="lucide:plus" width={12} height={12} />
                          </button>
                        )}
                      </div>
                      <span
                        className={`text-[9px] font-mono font-bold shrink-0 w-[12px] text-right ${statusColor}`}
                        title={statusTitle}
                      >
                        {statusLabel}
                      </span>
                    </div>
                  )
                }

                if (changeEntries.length === 0) {
                  return (
                    <div className="py-12 text-center">
                      <Icon
                        icon="lucide:check-circle"
                        width={28}
                        height={28}
                        className="mx-auto mb-2 text-[var(--color-additions)] opacity-40"
                      />
                      <p className="text-[11px] text-[var(--text-tertiary)]">Working tree clean</p>
                      <p className="text-[10px] text-[var(--text-disabled)] mt-0.5">
                        No pending changes
                      </p>
                    </div>
                  )
                }

                return (
                  <>
                    {isLocalMode && stagedEntries.length > 0 && (
                      <>
                        <div className="flex items-center h-[26px] px-3 bg-[var(--bg-subtle)] border-b border-[var(--border)] group/section">
                          <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                            Staged Changes
                          </span>
                          <span className="ml-1.5 px-1 min-w-[14px] text-center rounded-full bg-[var(--color-additions)] text-[var(--on-additions)] text-[8px] font-bold leading-[14px]">
                            {stagedEntries.length}
                          </span>
                          <div className="ml-auto hidden group-hover/section:flex items-center gap-0.5">
                            {discardConfirmSection === 'staged' ? (
                              <>
                                <span className="text-[9px] text-[var(--color-deletions)] mr-1">
                                  Discard all?
                                </span>
                                <button
                                  onClick={handleDiscardAllStaged}
                                  disabled={discarding}
                                  className="px-1.5 h-[18px] rounded-[var(--radius-sm)] text-[9px] font-medium bg-[var(--color-deletions)] text-[var(--on-deletions)] hover:opacity-90 cursor-pointer disabled:opacity-50"
                                >
                                  {discarding ? '...' : 'Yes'}
                                </button>
                                <button
                                  onClick={() => setDiscardConfirmSection(null)}
                                  className="px-1 h-[18px] rounded-[var(--radius-sm)] text-[9px] text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                                >
                                  No
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setDiscardConfirmSection('staged')}
                                  className="flex items-center justify-center w-[20px] h-[20px] rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--color-deletions)_12%,transparent)] text-[var(--text-disabled)] hover:text-[var(--color-deletions)] cursor-pointer transition-colors"
                                  title="Discard all staged changes"
                                >
                                  <Icon icon="lucide:undo-2" width={11} height={11} />
                                </button>
                                <button
                                  onClick={() => {
                                    const paths = stagedEntries.map((e) => e.path)
                                    if (paths.length > 0) local.unstageFiles(paths)
                                  }}
                                  className="flex items-center justify-center w-[20px] h-[20px] rounded-[var(--radius-sm)] hover:bg-[var(--bg-elevated)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
                                  title="Unstage all"
                                >
                                  <Icon icon="lucide:minus" width={11} height={11} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {stagedEntries.map((e) => renderEntry(e, true))}
                      </>
                    )}
                    {(isLocalMode ? unstagedEntries.length > 0 : true) && (
                      <>
                        {isLocalMode && (
                          <div className="flex items-center h-[26px] px-3 bg-[var(--bg-subtle)] border-b border-[var(--border)] group/section">
                            <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                              Changes
                            </span>
                            <span className="ml-1.5 px-1 min-w-[14px] text-center rounded-full bg-[var(--warning,#eab308)] text-white text-[8px] font-bold leading-[14px]">
                              {unstagedEntries.length}
                            </span>
                            <div className="ml-auto hidden group-hover/section:flex items-center gap-0.5">
                              {discardConfirmSection === 'changes' ? (
                                <>
                                  <span className="text-[9px] text-[var(--color-deletions)] mr-1">
                                    Discard all?
                                  </span>
                                  <button
                                    onClick={handleDiscardAllChanges}
                                    disabled={discarding}
                                    className="px-1.5 h-[18px] rounded-[var(--radius-sm)] text-[9px] font-medium bg-[var(--color-deletions)] text-[var(--on-deletions)] hover:opacity-90 cursor-pointer disabled:opacity-50"
                                  >
                                    {discarding ? '...' : 'Yes'}
                                  </button>
                                  <button
                                    onClick={() => setDiscardConfirmSection(null)}
                                    className="px-1 h-[18px] rounded-[var(--radius-sm)] text-[9px] text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                                  >
                                    No
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setDiscardConfirmSection('changes')}
                                    className="flex items-center justify-center w-[20px] h-[20px] rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--color-deletions)_12%,transparent)] text-[var(--text-disabled)] hover:text-[var(--color-deletions)] cursor-pointer transition-colors"
                                    title="Discard all changes"
                                  >
                                    <Icon icon="lucide:undo-2" width={11} height={11} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      const paths = unstagedEntries
                                        .filter((e) => e.source === 'git')
                                        .map((e) => e.path)
                                      if (paths.length > 0) local.stageFiles(paths)
                                    }}
                                    className="flex items-center justify-center w-[20px] h-[20px] rounded-[var(--radius-sm)] hover:bg-[var(--bg-elevated)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
                                    title="Stage all"
                                  >
                                    <Icon icon="lucide:plus" width={11} height={11} />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => local.refresh()}
                                className="flex items-center justify-center w-[20px] h-[20px] rounded-[var(--radius-sm)] hover:bg-[var(--bg-elevated)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
                                title="Refresh"
                              >
                                <Icon icon="lucide:refresh-cw" width={10} height={10} />
                              </button>
                            </div>
                          </div>
                        )}
                        {unstagedEntries.map((e) => renderEntry(e))}
                      </>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Commit area */}
            <div className="border-t border-[var(--border)] p-2.5 space-y-1.5 shrink-0 bg-[var(--bg)]">
              {commitError && (
                <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)] border border-[color-mix(in_srgb,var(--color-deletions)_20%,transparent)]">
                  <Icon
                    icon="lucide:alert-circle"
                    width={11}
                    height={11}
                    className="text-[var(--color-deletions)] shrink-0 mt-0.5"
                  />
                  <span className="text-[10px] text-[var(--color-deletions)] leading-snug">
                    {commitError}
                  </span>
                  <button
                    onClick={() => setCommitError(null)}
                    className="ml-auto shrink-0 text-[var(--color-deletions)] hover:opacity-70 cursor-pointer"
                  >
                    <Icon icon="lucide:x" width={10} height={10} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1">
                <input
                  ref={commitInputRef}
                  type="text"
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  placeholder="Commit message"
                  className="flex-1 h-[30px] px-2.5 text-[11px] rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)] transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && commitReady) handleCommit()
                  }}
                />
                <button
                  onClick={handleGenerateCommitMessage}
                  disabled={
                    generatingCommitMsg ||
                    changeEntries.length === 0 ||
                    gatewayStatus !== 'connected'
                  }
                  className={`shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] cursor-pointer transition-colors ${
                    generatingCommitMsg
                      ? 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hover)]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] hover:border-[var(--border-hover)] disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:border-[var(--border)] disabled:hover:text-[var(--text-disabled)]'
                  }`}
                  title={
                    gatewayStatus === 'connected'
                      ? 'Generate commit message with gateway AI'
                      : 'Connect gateway to generate commit message'
                  }
                >
                  <Icon
                    icon={generatingCommitMsg ? 'lucide:loader' : 'lucide:sparkles'}
                    width={12}
                    height={12}
                    className={generatingCommitMsg ? 'animate-spin' : ''}
                  />
                </button>
                <button
                  onClick={() => setShowDesc((v) => !v)}
                  className={`shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] cursor-pointer transition-colors ${
                    showDesc
                      ? 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hover)]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] hover:border-[var(--border-hover)]'
                  }`}
                  title="Add description"
                >
                  <Icon icon="lucide:text" width={12} height={12} />
                </button>
              </div>

              {showDesc && (
                <textarea
                  value={commitDesc}
                  onChange={(e) => setCommitDesc(e.target.value)}
                  placeholder="Extended description..."
                  rows={3}
                  className="w-full px-2.5 py-1.5 text-[11px] rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none resize-none focus:border-[var(--border-focus)] transition-colors leading-relaxed"
                />
              )}

              <button
                onClick={handleCommit}
                disabled={!commitReady}
                className={`w-full flex items-center justify-center gap-1.5 h-[32px] rounded-[var(--radius-sm)] text-[11px] font-semibold transition-all cursor-pointer ${
                  commitReady
                    ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)]'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'
                }`}
              >
                {committing ? (
                  <>
                    <Icon icon="lucide:loader" width={12} height={12} className="animate-spin" />
                    Committing...
                  </>
                ) : (
                  <>
                    <Icon icon="lucide:check" width={12} height={12} />
                    Commit{changeEntries.length > 0 ? ` (${changeEntries.length})` : ''}
                  </>
                )}
              </button>

              {isLocalMode &&
                (confirmUndo ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[var(--text-tertiary)] flex-1">
                      Undo last commit?
                    </span>
                    <button
                      onClick={handleUndoCommit}
                      disabled={undoingCommit}
                      className="h-[24px] px-2 text-[10px] font-medium rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-deletions)_12%,transparent)] text-[var(--color-deletions)] hover:bg-[color-mix(in_srgb,var(--color-deletions)_20%,transparent)] cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {undoingCommit ? 'Undoing...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setConfirmUndo(false)}
                      className="h-[24px] px-2 text-[10px] font-medium rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmUndo(true)}
                    className="w-full flex items-center justify-center gap-1.5 h-[26px] rounded-[var(--radius-sm)] text-[10px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
                  >
                    <Icon icon="lucide:undo-2" width={11} height={11} />
                    Undo last commit
                  </button>
                ))}

              {/* Push & upstream status */}
              {isLocalMode && (
                <div className="border-t border-[var(--border)] pt-2 mt-1 space-y-1.5">
                  {(local.aheadBehind.ahead > 0 || local.aheadBehind.behind > 0) && (
                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                      {local.aheadBehind.ahead > 0 && (
                        <span className="flex items-center gap-1">
                          <Icon
                            icon="lucide:arrow-up"
                            width={10}
                            height={10}
                            className="text-[var(--color-additions)]"
                          />
                          {local.aheadBehind.ahead} ahead
                        </span>
                      )}
                      {local.aheadBehind.behind > 0 && (
                        <span className="flex items-center gap-1">
                          <Icon
                            icon="lucide:arrow-down"
                            width={10}
                            height={10}
                            className="text-[var(--brand)]"
                          />
                          {local.aheadBehind.behind} behind
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    onClick={handlePush}
                    disabled={pushing}
                    className={`w-full flex items-center justify-center gap-1.5 h-[28px] rounded-[var(--radius-sm)] text-[10px] font-semibold transition-all cursor-pointer ${
                      pushing
                        ? 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] border border-[var(--border)]'
                    }`}
                  >
                    {pushing ? (
                      <>
                        <Icon
                          icon="lucide:loader"
                          width={11}
                          height={11}
                          className="animate-spin"
                        />{' '}
                        Pushing...
                      </>
                    ) : pushSuccess ? (
                      <>
                        <Icon
                          icon="lucide:check"
                          width={11}
                          height={11}
                          className="text-[var(--color-additions)]"
                        />{' '}
                        Pushed
                      </>
                    ) : (
                      <>
                        <Icon icon="lucide:arrow-up-circle" width={11} height={11} /> Push to origin
                      </>
                    )}
                  </button>
                  {pushError && (
                    <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)]">
                      <Icon
                        icon="lucide:alert-circle"
                        width={10}
                        height={10}
                        className="text-[var(--color-deletions)] shrink-0 mt-0.5"
                      />
                      <span className="text-[9px] text-[var(--color-deletions)] leading-snug">
                        {pushError}
                      </span>
                    </div>
                  )}
                  {/* gitquick actions */}
                  <div className="border-t border-[var(--border)] pt-1.5 mt-1.5">
                    <div className="flex items-center gap-1 mb-1">
                      <Icon
                        icon="lucide:zap"
                        width={9}
                        height={9}
                        className="text-[var(--text-disabled)]"
                      />
                      <span className="text-[8px] font-semibold text-[var(--text-disabled)] uppercase tracking-wider">
                        Quick Actions
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={async () => {
                          if (!commitMsg.trim()) return
                          setGqStatus('saving')
                          try {
                            const result = await local.gitSave(commitMsg.trim())
                            setGqStatus('done')
                            setCommitMsg('')
                            setGqMessage(result)
                            setTimeout(() => setGqStatus(null), 3000)
                          } catch (err) {
                            setGqStatus('error')
                            setGqMessage(err instanceof Error ? err.message : String(err))
                            setTimeout(() => setGqStatus(null), 5000)
                          }
                        }}
                        disabled={!commitMsg.trim() || gqStatus === 'saving'}
                        className="flex-1 flex items-center justify-center gap-1 h-[24px] rounded-[var(--radius-sm)] text-[9px] font-semibold bg-[color-mix(in_srgb,var(--color-additions)_10%,transparent)] text-[var(--color-additions)] hover:bg-[color-mix(in_srgb,var(--color-additions)_18%,transparent)] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="git add -A && commit && push"
                      >
                        <Icon icon="lucide:save" width={10} height={10} />
                        Save
                      </button>
                      <button
                        onClick={async () => {
                          setGqStatus('syncing')
                          try {
                            const result = await local.gitSync()
                            setGqStatus('done')
                            setGqMessage(result)
                            setTimeout(() => setGqStatus(null), 3000)
                          } catch (err) {
                            setGqStatus('error')
                            setGqMessage(err instanceof Error ? err.message : String(err))
                            setTimeout(() => setGqStatus(null), 5000)
                          }
                        }}
                        disabled={gqStatus === 'syncing'}
                        className="flex-1 flex items-center justify-center gap-1 h-[24px] rounded-[var(--radius-sm)] text-[9px] font-semibold bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--brand)] hover:bg-[color-mix(in_srgb,var(--brand)_18%,transparent)] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="git pull --rebase && push"
                      >
                        <Icon icon="lucide:refresh-cw" width={10} height={10} />
                        Sync
                      </button>
                      <button
                        onClick={async () => {
                          setGqStatus('cleaning')
                          try {
                            const result = await local.gitCleanBranches()
                            setGqStatus('done')
                            setGqMessage(result)
                            setTimeout(() => setGqStatus(null), 3000)
                          } catch (err) {
                            setGqStatus('error')
                            setGqMessage(err instanceof Error ? err.message : String(err))
                            setTimeout(() => setGqStatus(null), 5000)
                          }
                        }}
                        disabled={gqStatus === 'cleaning'}
                        className="flex-1 flex items-center justify-center gap-1 h-[24px] rounded-[var(--radius-sm)] text-[9px] font-semibold bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-tertiary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete merged branches"
                      >
                        <Icon icon="lucide:scissors" width={10} height={10} />
                        Clean
                      </button>
                    </div>
                    {gqStatus && gqMessage && (
                      <div
                        className={`mt-1 px-2 py-1 rounded-[var(--radius-sm)] text-[9px] leading-snug ${
                          gqStatus === 'error'
                            ? 'bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)] text-[var(--color-deletions)]'
                            : gqStatus === 'done'
                              ? 'bg-[color-mix(in_srgb,var(--color-additions)_8%,transparent)] text-[var(--color-additions)]'
                              : 'bg-[var(--bg-subtle)] text-[var(--text-tertiary)]'
                        }`}
                      >
                        {gqStatus === 'saving'
                          ? 'Saving...'
                          : gqStatus === 'syncing'
                            ? 'Syncing...'
                            : gqStatus === 'cleaning'
                              ? 'Cleaning...'
                              : gqMessage}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* History tab */
          <div className="flex-1 overflow-y-auto">
            {loadingHistory ? (
              <div className="py-12 text-center">
                <Icon
                  icon="lucide:loader"
                  width={16}
                  height={16}
                  className="mx-auto animate-spin text-[var(--brand)]"
                />
              </div>
            ) : (
              commits.map((c) => (
                <button
                  key={c.sha}
                  onClick={() => loadCommitFilesData(c)}
                  className={`w-full text-left px-3 py-2.5 border-b border-[var(--border)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors ${
                    selectedCommit?.sha === c.sha
                      ? 'bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]'
                      : ''
                  }`}
                >
                  <div className="text-[11px] font-medium text-[var(--text-primary)] truncate leading-snug">
                    {c.message}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[9px] font-mono text-[var(--brand)] font-medium">
                      {c.shortSha}
                    </span>
                    <span className="text-[var(--text-disabled)]">&middot;</span>
                    <span className="text-[9px] text-[var(--text-tertiary)]">{c.author}</span>
                    <span className="text-[var(--text-disabled)]">&middot;</span>
                    <span className="text-[9px] text-[var(--text-disabled)]">{c.date}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right panel — diff viewer (hidden on mobile, shown when file selected) */}
      <div className="hidden sm:flex flex-1 flex-col bg-[var(--bg-elevated)] overflow-hidden">
        {tab === 'changes' && activeDiff ? (
          <>
            <DiffHeader path={activeDiff.path} lines={activeDiff.lines} />
            <DiffTable lines={activeDiff.lines} />
          </>
        ) : tab === 'changes' && localDiffPatch ? (
          <>
            <div className="flex items-center justify-between h-[34px] px-4 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Icon
                  icon="lucide:file-diff"
                  width={12}
                  height={12}
                  className="text-[var(--text-tertiary)] shrink-0"
                />
                <span className="text-[11px] font-mono font-medium text-[var(--text-primary)] truncate">
                  {activeFilePath}
                </span>
              </div>
            </div>
            <PatchViewer patch={localDiffPatch} />
          </>
        ) : tab === 'changes' &&
          activeFilePath &&
          changeEntries.find((e) => e.path === activeFilePath)?.status === '??' ? (
          <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--text-disabled)]">
            <div className="text-center">
              <Icon
                icon="lucide:file-plus"
                width={32}
                height={32}
                className="mx-auto mb-3 text-[var(--color-additions)] opacity-30"
              />
              <p className="text-[12px] text-[var(--text-tertiary)] font-medium">Untracked file</p>
              <p className="text-[10px] text-[var(--text-disabled)] mt-1 font-mono">
                {activeFilePath}
              </p>
              <p className="text-[10px] text-[var(--text-disabled)] mt-2">
                This file is new and not yet tracked by git
              </p>
            </div>
          </div>
        ) : tab === 'history' && selectedCommit ? (
          <>
            <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
              <div className="text-[12px] font-semibold text-[var(--text-primary)] mb-1 leading-snug">
                {selectedCommit.message}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {selectedCommit.author}
                </span>
                <span className="text-[var(--text-disabled)]">&middot;</span>
                <span className="text-[10px] text-[var(--text-disabled)]">
                  {selectedCommit.date}
                </span>
                <span className="ml-auto text-[10px] font-mono text-[var(--brand)] font-medium">
                  {selectedCommit.shortSha}
                </span>
              </div>
            </div>
            {activeCommitFile ? (
              <>
                {(() => {
                  const media = detectMedia(activeCommitFile.filename)
                  const fileIcon =
                    media === 'image'
                      ? 'lucide:image'
                      : media === 'video'
                        ? 'lucide:video'
                        : media === 'audio'
                          ? 'lucide:music'
                          : 'lucide:file-diff'
                  return (
                    <div className="flex items-center gap-2 h-[34px] px-4 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
                      <button
                        onClick={() => setActiveCommitFile(null)}
                        className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
                      >
                        <Icon icon="lucide:arrow-left" width={12} height={12} />
                      </button>
                      <Icon
                        icon={fileIcon}
                        width={11}
                        height={11}
                        className="text-[var(--text-tertiary)]"
                      />
                      <span className="text-[11px] font-mono font-medium text-[var(--text-primary)] truncate">
                        {activeCommitFile.filename}
                      </span>
                      <div className="flex-1" />
                      {!media && (
                        <>
                          <span className="text-[10px] font-mono text-[var(--color-additions)] font-medium">
                            +{activeCommitFile.additions}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--color-deletions)] font-medium">
                            -{activeCommitFile.deletions}
                          </span>
                        </>
                      )}
                    </div>
                  )
                })()}
                {detectMedia(activeCommitFile.filename) ? (
                  <CommitMediaPreview
                    filename={activeCommitFile.filename}
                    url={activeCommitFile.raw_url}
                  />
                ) : (
                  <PatchViewer patch={activeCommitFile.patch} />
                )}
              </>
            ) : commitFilesData.length > 0 ? (
              <div className="flex-1 overflow-y-auto">
                {commitFilesData.map((f) => (
                  <button
                    key={f.filename}
                    onClick={() => setActiveCommitFile(f)}
                    className="w-full text-left flex items-center gap-2 px-4 h-[30px] hover:bg-[var(--bg-subtle)] cursor-pointer border-b border-[var(--border)] transition-colors"
                  >
                    <FileStatusIcon status={f.status} />
                    <span className="text-[11px] font-mono text-[var(--text-secondary)] truncate flex-1">
                      {f.filename}
                    </span>
                    <span className="text-[9px] font-mono text-[var(--color-additions)]">
                      +{f.additions}
                    </span>
                    <span className="text-[9px] font-mono text-[var(--color-deletions)]">
                      -{f.deletions}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <Icon
                  icon="lucide:loader"
                  width={16}
                  height={16}
                  className="animate-spin text-[var(--brand)]"
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--text-disabled)]">
            <div className="text-center">
              <Icon
                icon="lucide:git-compare"
                width={32}
                height={32}
                className="mx-auto mb-3 opacity-20"
              />
              <p className="text-[12px] text-[var(--text-tertiary)] font-medium">
                {tab === 'changes'
                  ? 'Select a file to view changes'
                  : 'Select a commit to view details'}
              </p>
              <p className="text-[10px] text-[var(--text-disabled)] mt-1">
                {tab === 'changes'
                  ? 'Click on a changed file in the sidebar'
                  : 'Click on a commit from the history'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared sub-components ─────────────────────────────────────

function FileStatusIcon({ status }: { status: string }) {
  const icon =
    status === 'added'
      ? 'lucide:plus'
      : status === 'removed'
        ? 'lucide:minus'
        : status === 'renamed'
          ? 'lucide:arrow-right'
          : 'lucide:pencil'
  const color =
    status === 'added'
      ? 'text-[var(--color-additions)]'
      : status === 'removed'
        ? 'text-[var(--color-deletions)]'
        : 'text-[var(--warning,#eab308)]'
  return <Icon icon={icon} width={10} height={10} className={color} />
}

function DiffHeader({ path, lines }: { path: string; lines: DiffLine[] }) {
  const stats = useMemo(() => {
    let added = 0,
      removed = 0
    for (const l of lines) {
      if (l.type === 'added') added++
      else if (l.type === 'removed') removed++
    }
    return { added, removed }
  }, [lines])

  return (
    <div className="flex items-center justify-between h-[34px] px-4 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Icon
          icon="lucide:file-diff"
          width={12}
          height={12}
          className="text-[var(--text-tertiary)] shrink-0"
        />
        <span className="text-[11px] font-mono font-medium text-[var(--text-primary)] truncate">
          {path}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-[var(--color-additions)] font-medium">
            +{stats.added}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-[var(--color-deletions)] font-medium">
            -{stats.removed}
          </span>
        </div>
        {/* Mini change bar */}
        {stats.added + stats.removed > 0 && (
          <div className="flex h-[3px] w-[48px] rounded-full overflow-hidden bg-[var(--bg-subtle)]">
            {stats.added > 0 && (
              <div
                className="bg-[var(--color-additions)]"
                style={{ width: `${(stats.added / (stats.added + stats.removed)) * 100}%` }}
              />
            )}
            {stats.removed > 0 && (
              <div
                className="bg-[var(--color-deletions)]"
                style={{ width: `${(stats.removed / (stats.added + stats.removed)) * 100}%` }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Diff Table (side-by-side line numbers, gutter markers) ────

function DiffTable({ lines }: { lines: DiffLine[] }) {
  const chunks = useMemo(() => buildHunks(lines), [lines])

  return (
    <div className="flex-1 overflow-auto font-mono text-[11px] leading-[1.65]">
      {chunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx}>
          {/* Hunk separator with fold context */}
          {hunkIdx > 0 && (
            <div className="flex items-center h-[24px] bg-[color-mix(in_srgb,var(--brand)_4%,transparent)] border-y border-[var(--border)]">
              <div className="w-[42px] shrink-0" />
              <div className="w-[42px] shrink-0" />
              <div className="w-5 shrink-0 flex items-center justify-center">
                <Icon
                  icon="lucide:ellipsis"
                  width={10}
                  height={10}
                  className="text-[var(--text-disabled)]"
                />
              </div>
              <span className="text-[9px] text-[var(--text-disabled)] pl-1">
                {hunk.contextLabel}
              </span>
            </div>
          )}
          <table className="w-full border-collapse">
            <tbody>
              {hunk.lines.map((line, idx) => (
                <DiffRow key={`${hunkIdx}-${idx}`} line={line} />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function DiffRow({ line }: { line: DiffLine }) {
  const bgClass =
    line.type === 'added'
      ? 'bg-[color-mix(in_srgb,var(--color-additions)_8%,transparent)]'
      : line.type === 'removed'
        ? 'bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)]'
        : ''

  const gutterBg =
    line.type === 'added'
      ? 'bg-[color-mix(in_srgb,var(--color-additions)_15%,transparent)]'
      : line.type === 'removed'
        ? 'bg-[color-mix(in_srgb,var(--color-deletions)_15%,transparent)]'
        : ''

  return (
    <tr className={`${bgClass} hover:brightness-95 transition-[filter] duration-75`}>
      <td
        className={`w-[42px] text-right pr-2 pl-3 select-none text-[10px] border-r border-[var(--border)] ${gutterBg} ${
          line.type === 'removed' ? 'text-[var(--color-deletions)]' : 'text-[var(--text-disabled)]'
        }`}
      >
        {line.oldNum ?? ''}
      </td>
      <td
        className={`w-[42px] text-right pr-2 pl-1.5 select-none text-[10px] border-r border-[var(--border)] ${gutterBg} ${
          line.type === 'added' ? 'text-[var(--color-additions)]' : 'text-[var(--text-disabled)]'
        }`}
      >
        {line.newNum ?? ''}
      </td>
      <td
        className={`w-5 text-center select-none text-[10px] font-bold ${
          line.type === 'added'
            ? 'text-[var(--color-additions)]'
            : line.type === 'removed'
              ? 'text-[var(--color-deletions)]'
              : 'text-transparent'
        }`}
      >
        {line.type === 'added' ? '+' : line.type === 'removed' ? '\u2212' : ' '}
      </td>
      <td
        className={`pl-1.5 pr-4 whitespace-pre ${
          line.type === 'added'
            ? 'text-[var(--color-additions)]'
            : line.type === 'removed'
              ? 'text-[var(--color-deletions)] opacity-75'
              : 'text-[var(--text-secondary)]'
        }`}
      >
        {line.content}
      </td>
    </tr>
  )
}

// ─── Patch viewer (for commit history diffs) ───────────────────

function PatchViewer({ patch }: { patch?: string }) {
  const parsedLines = useMemo(() => {
    if (!patch) return null
    return patch.split('\n').map((raw, i) => {
      let type: 'added' | 'removed' | 'header' | 'context' = 'context'
      if (raw.startsWith('+') && !raw.startsWith('+++')) type = 'added'
      else if (raw.startsWith('-') && !raw.startsWith('---')) type = 'removed'
      else if (raw.startsWith('@@')) type = 'header'
      return { type, content: raw, key: i }
    })
  }, [patch])

  if (!parsedLines) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--text-disabled)]">
        Binary file
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto font-mono text-[11px] leading-[1.65]">
      <table className="w-full border-collapse">
        <tbody>
          {parsedLines.map((line) => (
            <tr
              key={line.key}
              className={
                line.type === 'added'
                  ? 'bg-[color-mix(in_srgb,var(--color-additions)_8%,transparent)]'
                  : line.type === 'removed'
                    ? 'bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)]'
                    : line.type === 'header'
                      ? 'bg-[color-mix(in_srgb,var(--brand)_6%,transparent)]'
                      : ''
              }
            >
              <td
                className={`w-5 text-center select-none text-[10px] font-bold border-r border-[var(--border)] ${
                  line.type === 'added'
                    ? 'text-[var(--color-additions)] bg-[color-mix(in_srgb,var(--color-additions)_15%,transparent)]'
                    : line.type === 'removed'
                      ? 'text-[var(--color-deletions)] bg-[color-mix(in_srgb,var(--color-deletions)_15%,transparent)]'
                      : 'text-transparent'
                }`}
              >
                {line.type === 'added' ? '+' : line.type === 'removed' ? '\u2212' : ' '}
              </td>
              <td
                className={`pl-2 pr-4 whitespace-pre ${
                  line.type === 'added'
                    ? 'text-[var(--color-additions)]'
                    : line.type === 'removed'
                      ? 'text-[var(--color-deletions)] opacity-75'
                      : line.type === 'header'
                        ? 'text-[var(--brand)] font-semibold opacity-80'
                        : 'text-[var(--text-secondary)]'
                }`}
              >
                {line.content}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Hunk builder (groups context lines, collapses long runs) ──

interface Hunk {
  lines: DiffLine[]
  contextLabel: string
}

function buildHunks(lines: DiffLine[], contextSize = 3): Hunk[] {
  if (lines.length === 0) return []

  // Find ranges of changed lines
  const changeIndices: number[] = []
  lines.forEach((l, i) => {
    if (l.type === 'added' || l.type === 'removed') changeIndices.push(i)
  })

  if (changeIndices.length === 0) {
    return [{ lines, contextLabel: '' }]
  }

  // Build ranges with context around changes
  const ranges: Array<[number, number]> = []
  let rangeStart = Math.max(0, changeIndices[0] - contextSize)
  let rangeEnd = Math.min(lines.length - 1, changeIndices[0] + contextSize)

  for (let k = 1; k < changeIndices.length; k++) {
    const cStart = Math.max(0, changeIndices[k] - contextSize)
    const cEnd = Math.min(lines.length - 1, changeIndices[k] + contextSize)

    if (cStart <= rangeEnd + 1) {
      rangeEnd = cEnd
    } else {
      ranges.push([rangeStart, rangeEnd])
      rangeStart = cStart
      rangeEnd = cEnd
    }
  }
  ranges.push([rangeStart, rangeEnd])

  return ranges.map(([start, end], idx) => {
    const hunkLines = lines.slice(start, end + 1)
    const firstLine = hunkLines.find((l) => l.oldNum || l.newNum)
    const label = firstLine ? `Line ${firstLine.oldNum ?? firstLine.newNum}` : ''
    return { lines: hunkLines, contextLabel: idx > 0 ? label : '' }
  })
}
