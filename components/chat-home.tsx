'use client'

import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { Icon } from '@iconify/react'
import { motion, AnimatePresence } from 'framer-motion'
import { KnotLogo } from '@/components/knot-logo'
import { ModeSelector } from '@/components/mode-selector'
import type { AgentMode } from '@/components/mode-selector'
import { PermissionsToggle } from '@/components/permissions-toggle'
import { useRepo, type RepoInfo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { useGateway } from '@/context/gateway-context'
import { useGitHubAuth } from '@/context/github-auth-context'
import { useEditor } from '@/context/editor-context'
import { useView } from '@/context/view-context'
import { emit } from '@/lib/events'
import { getRecentFolders } from '@/context/local-context'
import { getAgentConfig } from '@/lib/agent-session'
import { fetchRepoByName, fetchAuthenticatedUser, type GitHubUser } from '@/lib/github-api'
import { getFavorites, getRecents, addRecent, type SavedRepo } from '@/lib/github-repos-store'

// Mock recent chats data
const MOCK_RECENT_CHATS = [
  { id: 1, title: 'Refactor authentication flow', timestamp: '2h ago' },
  { id: 2, title: 'Add dark mode toggle', timestamp: 'Yesterday' },
  { id: 3, title: 'Fix navigation bug', timestamp: '3d ago' },
]

const STATIC_SUGGESTIONS = [
  {
    icon: 'lucide:layout-template',
    label: 'Scaffold a production-ready feature with UI, state, and tests.',
    color: 'var(--text-secondary)',
    bg: 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
  },
  {
    icon: 'lucide:bug',
    label: 'Debug a React or TypeScript issue and explain the root cause.',
    color: '#ef4444',
    bg: 'color-mix(in srgb, #ef4444 8%, transparent)',
  },
  {
    icon: 'lucide:git-pull-request',
    label: 'Review a set of code changes for bugs, regressions, and missing tests.',
    color: '#22c55e',
    bg: 'color-mix(in srgb, #22c55e 8%, transparent)',
  },
  {
    icon: 'lucide:sparkles',
    label: 'Generate a complete component with types, tests, and documentation.',
    color: '#8b5cf6',
    bg: 'color-mix(in srgb, #8b5cf6 8%, transparent)',
  },
]

// Animated placeholder texts
const PLACEHOLDER_TEXTS = [
  'What shall we build today?',
  'Describe a feature to scaffold...',
  'Paste an error to debug...',
  'Ask about your codebase...',
]

// Dynamic greeting based on time
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 21) return 'Good evening'
  return 'Night owl mode'
}

function detectPrimaryLanguage(files: Array<{ path: string; is_dir: boolean }>): string | null {
  const extCounts: Record<string, number> = {}
  const langMap: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    py: 'Python',
    rs: 'Rust',
    go: 'Go',
    rb: 'Ruby',
    java: 'Java',
    swift: 'Swift',
    kt: 'Kotlin',
    cpp: 'C++',
    c: 'C',
    cs: 'C#',
    php: 'PHP',
    vue: 'Vue',
    svelte: 'Svelte',
  }
  for (const f of files) {
    if (f.is_dir) continue
    const ext = f.path.split('.').pop()?.toLowerCase() ?? ''
    if (langMap[ext]) extCounts[ext] = (extCounts[ext] ?? 0) + 1
  }
  const top = Object.entries(extCounts).sort((a, b) => b[1] - a[1])[0]
  return top ? (langMap[top[0]] ?? null) : null
}

interface Props {
  onSend: (text: string, mode: AgentMode) => void
  onSelectFolder: () => void
  onCloneRepo: () => void
  onImageAttach?: () => void
  imageAttachments?: Array<{ name: string; dataUrl: string }>
  onRemoveImage?: (index: number) => void
}

export const ChatHome = memo(function ChatHome({
  onSend,
  onSelectFolder,
  onCloneRepo,
  onImageAttach,
  imageAttachments = [],
  onRemoveImage,
}: Props) {
  const [input, setInput] = useState('')
  const [agentMode, setAgentMode] = useState<AgentMode>('ask')
  const [isFocused, setIsFocused] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { repo, setRepo } = useRepo()
  const local = useLocal()
  const { status } = useGateway()
  const { setView } = useView()
  const { files: openFiles } = useEditor()
  const { token: ghToken, authenticated: ghAuthenticated } = useGitHubAuth()

  const repoShort = useMemo(
    () => repo?.fullName?.split('/').pop() ?? local.rootPath?.split('/').pop() ?? null,
    [repo?.fullName, local.rootPath],
  )
  const hasWorkspace = !!repoShort
  const branchName = local.gitInfo?.branch ?? null

  const [isComposing, setIsComposing] = useState(false)
  const [showRepoInput, setShowRepoInput] = useState(false)
  const [repoInput, setRepoInput] = useState('')
  const [repoLoading, setRepoLoading] = useState(false)
  const [repoError, setRepoError] = useState<string | null>(null)
  const repoInputRef = useRef<HTMLInputElement>(null)
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null)
  const [savedFavorites, setSavedFavorites] = useState<SavedRepo[]>([])
  const [savedRecents, setSavedRecents] = useState<SavedRepo[]>([])

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  // Fetch GitHub user when token is available
  useEffect(() => {
    if (!ghToken) {
      setGhUser(null)
      return
    }
    fetchAuthenticatedUser().then((u) => setGhUser(u))
  }, [ghToken])

  // Load favorites + recents
  useEffect(() => {
    setSavedFavorites(getFavorites())
    setSavedRecents(getRecents())
  }, [ghToken])

  const handleRepoConnect = useCallback(async () => {
    const val = repoInput
      .trim()
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/\/$/, '')
    if (!val || !val.includes('/')) {
      setRepoError('Enter owner/repo (e.g. OpenKnots/code-editor)')
      return
    }
    setRepoLoading(true)
    setRepoError(null)
    try {
      const ghRepo = await fetchRepoByName(val)
      const info: RepoInfo = {
        owner: ghRepo.owner.login,
        repo: ghRepo.name,
        branch: ghRepo.default_branch,
        fullName: ghRepo.full_name,
      }
      setRepo(info)
      setSavedRecents(
        addRecent({
          fullName: ghRepo.full_name,
          name: ghRepo.name,
          owner: ghRepo.owner.login,
          defaultBranch: ghRepo.default_branch,
          addedAt: Date.now(),
        }),
      )
      setShowRepoInput(false)
      setRepoInput('')
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : 'Repository not found')
    } finally {
      setRepoLoading(false)
    }
  }, [repoInput, setRepo])

  const selectSavedRepo = useCallback(
    (saved: SavedRepo) => {
      const info: RepoInfo = {
        owner: saved.owner,
        repo: saved.name,
        branch: saved.defaultBranch,
        fullName: saved.fullName,
      }
      setRepo(info)
      setSavedRecents(addRecent(saved))
    },
    [setRepo],
  )

  useEffect(() => {
    if (showRepoInput) {
      setTimeout(() => repoInputRef.current?.focus(), 100)
    }
  }, [showRepoInput])

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])

  // Cycle placeholder text every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_TEXTS.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

  const startOrSend = useCallback(() => {
    const t = input.trim()
    onSend(t || '', agentMode)
    setInput('')
  }, [input, agentMode, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isComposing) return
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        startOrSend()
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        startOrSend()
      }
      if (e.key === 'Tab' && !input.trim()) {
        e.preventDefault()
        setAgentMode((m) => (m === 'ask' ? 'agent' : 'ask'))
      }
    },
    [startOrSend, input, isComposing],
  )

  const suggestions = useMemo(() => {
    if (!hasWorkspace) return STATIC_SUGGESTIONS

    const contextCards: typeof STATIC_SUGGESTIONS = []
    const langLabel = detectPrimaryLanguage(local.localTree ?? []) ?? 'this project'

    if (openFiles.length > 0) {
      const recent = openFiles[openFiles.length - 1]
      const name = recent.path.split('/').pop() || recent.path
      contextCards.push({
        icon: 'lucide:file-search',
        label: `Explain how ${name} fits into the app and suggest the safest next edit.`,
        color: 'var(--brand)',
        bg: 'color-mix(in srgb, var(--brand) 8%, transparent)',
      })
    } else {
      contextCards.push({
        icon: 'lucide:compass',
        label: `Inspect this codebase and explain the main architecture and entry points.`,
        color: 'var(--text-secondary)',
        bg: 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
      })
    }

    contextCards.push({
      icon: 'lucide:shield-check',
      label: `Review the current changes for bugs, regressions, and missing tests before I commit.`,
      color: '#ef4444',
      bg: 'color-mix(in srgb, #ef4444 8%, transparent)',
    })

    if (branchName) {
      contextCards.push({
        icon: 'lucide:git-compare-arrows',
        label: `Summarize what changed on ${branchName} and list the highest-priority follow-ups.`,
        color: '#22c55e',
        bg: 'color-mix(in srgb, #22c55e 8%, transparent)',
      })
    } else {
      contextCards.push({
        icon: 'lucide:test-tubes',
        label: `Add tests around the most critical paths in this ${langLabel} project.`,
        color: '#22c55e',
        bg: 'color-mix(in srgb, #22c55e 8%, transparent)',
      })
    }

    // Always add the 4th sparkles card for workspace view
    contextCards.push({
      icon: 'lucide:sparkles',
      label: 'Generate a complete component with types, tests, and documentation.',
      color: '#8b5cf6',
      bg: 'color-mix(in srgb, #8b5cf6 8%, transparent)',
    })

    return contextCards.slice(0, 4)
  }, [hasWorkspace, openFiles, local.localTree, branchName])

  return (
    <div className="flex-1 overflow-y-auto relative">
      <div className="min-h-full w-full max-w-[720px] mx-auto flex flex-col justify-start pt-[clamp(2.75rem,8vh,5rem)] sm:justify-center sm:pt-0 px-4 sm:px-6 py-4 sm:py-10 md:py-12 relative z-[1]">
        {/* Header */}
        <div className="flex flex-col items-center mb-6 sm:mb-7">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mb-3"
          >
            <KnotLogo size={34} color="var(--text-primary)" />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-[13px] text-[var(--text-secondary)] mb-2 font-medium"
          >
            {getGreeting()}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-center text-[28px] sm:text-[32px] font-medium tracking-[-0.04em] leading-none text-[var(--text-primary)]"
          >
            What shall we build?
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-2 max-w-[28rem] text-center text-[12px] leading-5 text-[var(--text-disabled)] sm:text-[13px]"
          >
            Open a project or describe changes, and we&apos;ll help you shape it.
          </motion.p>

          {/* Workspace dropdown — hidden on mobile */}
          <button
            onClick={onSelectFolder}
            className="codex-workspace-dropdown mt-2.5 hidden sm:inline-flex items-center gap-1.5 text-[14px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            {repoShort ?? 'Select workspace'}
            <Icon icon="lucide:chevron-down" width={14} height={14} className="opacity-50" />
          </button>
          {/* Mobile project selector */}
          {isMobile && (
            <div className="mt-3 flex flex-col items-center gap-2 w-full max-w-[320px]">
              {/* Not signed in — link to Settings */}
              {!ghAuthenticated && (
                <button
                  onClick={() => emit('open-settings')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[var(--border)] text-[12px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:border-[var(--text-disabled)] transition-all cursor-pointer"
                >
                  <Icon icon="lucide:github" width={14} height={14} />
                  Sign in to GitHub via Settings
                </button>
              )}

              {/* Signed in — favorites + recents picker */}
              {ghAuthenticated && !hasWorkspace && !showRepoInput && (
                <div className="w-full space-y-2">
                  {/* Favorites */}
                  {savedFavorites.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-disabled)] font-medium mb-1.5 px-1">
                        Favorites
                      </p>
                      <div className="space-y-0.5">
                        {savedFavorites.map((r) => (
                          <button
                            key={r.fullName}
                            onClick={() => selectSavedRepo(r)}
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] transition-colors cursor-pointer text-left"
                          >
                            <Icon
                              icon="lucide:star"
                              width={12}
                              className="text-amber-400 shrink-0"
                            />
                            <span className="text-[12px] text-[var(--text-primary)] truncate flex-1">
                              {r.fullName}
                            </span>
                            <Icon
                              icon="lucide:chevron-right"
                              width={12}
                              className="text-[var(--text-disabled)] shrink-0"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recents */}
                  {savedRecents.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-disabled)] font-medium mb-1.5 px-1">
                        Recent
                      </p>
                      <div className="space-y-0.5">
                        {savedRecents
                          .filter((r) => !savedFavorites.some((f) => f.fullName === r.fullName))
                          .slice(0, 5)
                          .map((r) => (
                            <button
                              key={r.fullName}
                              onClick={() => selectSavedRepo(r)}
                              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] transition-colors cursor-pointer text-left"
                            >
                              <Icon
                                icon="lucide:clock"
                                width={12}
                                className="text-[var(--text-disabled)] shrink-0"
                              />
                              <span className="text-[12px] text-[var(--text-primary)] truncate flex-1">
                                {r.fullName}
                              </span>
                              <Icon
                                icon="lucide:chevron-right"
                                width={12}
                                className="text-[var(--text-disabled)] shrink-0"
                              />
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Manual input fallback */}
                  <button
                    onClick={() => setShowRepoInput(true)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[var(--border)] text-[12px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:border-[var(--text-disabled)] transition-all cursor-pointer"
                  >
                    <Icon icon="lucide:plus" width={13} />
                    Open a repository
                  </button>
                </div>
              )}

              {/* Repo input */}
              {ghAuthenticated && !hasWorkspace && showRepoInput && (
                <div className="w-full">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 relative">
                      <Icon
                        icon="lucide:github"
                        width={14}
                        height={14}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]"
                      />
                      <input
                        ref={repoInputRef}
                        type="text"
                        value={repoInput}
                        onChange={(e) => {
                          setRepoInput(e.target.value)
                          setRepoError(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRepoConnect()
                          if (e.key === 'Escape') setShowRepoInput(false)
                        }}
                        placeholder="owner/repo"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_80%,transparent)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)] transition-colors"
                      />
                    </div>
                    <button
                      onClick={handleRepoConnect}
                      disabled={repoLoading || !repoInput.trim()}
                      className="shrink-0 px-3 py-2 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-40 bg-[var(--brand)] text-[var(--brand-contrast,#fff)]"
                    >
                      {repoLoading ? '…' : 'Go'}
                    </button>
                  </div>
                  {repoError && (
                    <p className="mt-1.5 text-[11px] text-[var(--color-deletions)]">{repoError}</p>
                  )}
                </div>
              )}

              {/* Connected repo — tap to switch */}
              {hasWorkspace && (
                <button
                  onClick={() => {
                    setRepo(null)
                    setShowRepoInput(false)
                  }}
                  className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:folder-git-2" width={13} height={13} className="opacity-60" />
                  {repo?.fullName ?? repoShort}
                  <Icon icon="lucide:chevron-down" width={12} height={12} className="opacity-40" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Quick links — desktop only */}
        <div className="hidden sm:flex justify-end gap-4 mb-2">
          <button
            onClick={() => setView('prompts')}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
          >
            <Icon icon="lucide:book-open" width={11} height={11} />
            Browse prompt library
          </button>
          <button
            onClick={() => emit('open-folder')}
            className="text-[12px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
          >
            Explore more
          </button>
        </div>

        {/* Suggestion cards — hidden on mobile, 2x2 grid desktop with staggered animation */}
        <div className="codex-suggestion-grid hidden sm:grid grid-cols-2 gap-3.5 mb-4">
          {suggestions.map((card, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.4 + i * 0.08,
                type: 'spring',
                stiffness: 400,
                damping: 30,
              }}
              onClick={() => onSend(card.label, agentMode)}
              className="codex-suggestion-card group flex w-full flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-left transition-colors duration-200 cursor-pointer hover:border-[var(--border-hover)]"
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: card.bg,
                }}
              >
                <Icon
                  icon={card.icon}
                  width={20}
                  height={20}
                  style={{ color: card.color }}
                  className="opacity-90"
                />
              </div>
              <p className="line-clamp-2 text-[13px] leading-[1.5] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                {card.label}
              </p>
            </motion.button>
          ))}
        </div>

        {/* Recent Chats section — desktop only */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="hidden sm:block mb-5"
        >
          <p className="mb-2.5 px-1 text-[11px] font-medium text-[var(--text-disabled)]">
            Recent Chats
          </p>
          <div className="space-y-2">
            {MOCK_RECENT_CHATS.map((chat) => (
              <button
                key={chat.id}
                onClick={() => console.log('Open chat', chat.id)}
                className="recent-chat-card w-full flex items-center justify-between gap-3 p-3 text-left cursor-pointer group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors truncate">
                    {chat.title}
                  </p>
                </div>
                <span className="text-[10px] text-[var(--text-disabled)] font-mono shrink-0">
                  {chat.timestamp}
                </span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Composer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          onClick={() => inputRef.current?.focus()}
          className={`codex-composer overflow-hidden rounded-[20px] border transition-all duration-200 ${
            isFocused
              ? 'border-[var(--brand)]'
              : 'border-[var(--border)] hover:border-[var(--border-hover)]'
          }`}
          style={{
            background: 'var(--bg-elevated)',
            boxShadow: isFocused ? '0 0 0 1px var(--brand)' : 'none',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={
              repoShort
                ? `Ask KnotCode anything, @ to add files, / for commands`
                : PLACEHOLDER_TEXTS[placeholderIndex]
            }
            aria-label="Chat input"
            className="w-full bg-transparent px-4 pt-3.5 pb-2 text-[14px] leading-[1.6] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none resize-none min-h-[48px] max-h-[200px] overflow-y-auto placeholder:transition-opacity placeholder:duration-500"
            key={placeholderIndex}
          />

          {/* Image previews */}
          {imageAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-1">
              {imageAttachments.map((img, i) => (
                <div
                  key={i}
                  className="relative group/img rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] overflow-hidden"
                  style={{ width: 72, height: 48 }}
                >
                  <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                  {onRemoveImage && (
                    <button
                      onClick={() => onRemoveImage(i)}
                      className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-black/50 text-white/80 hover:bg-red-500/80 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all cursor-pointer"
                    >
                      <Icon icon="lucide:x" width={7} height={7} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Bottom toolbar — Codex-style pill bar */}
          <div className="px-3 pb-2.5 pt-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* + button */}
                <button
                  onClick={onImageAttach}
                  className="codex-pill-btn flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-disabled)] transition-colors cursor-pointer hover:border-[var(--border-hover)] hover:text-[var(--text-secondary)]"
                  title="Attach file"
                >
                  <Icon icon="lucide:plus" width={14} height={14} />
                </button>

                {/* Mode selector */}
                <ModeSelector mode={agentMode} onChange={setAgentMode} size="sm" />

                {/* Divider — desktop only */}
                <div className="hidden sm:block w-px h-4 bg-[var(--border)]" />

                {/* Gateway status — desktop only */}
                <span
                  className={`codex-pill hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-default ${
                    status === 'connected'
                      ? 'text-[var(--text-secondary)] border-[var(--border)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]'
                      : 'text-[var(--text-disabled)] border-[var(--border)] bg-[color-mix(in_srgb,var(--text-primary)_3%,transparent)]'
                  }`}
                >
                  <Icon icon="lucide:monitor" width={12} height={12} />
                  {status === 'connected' ? 'Local' : 'Offline'}
                </span>

                {/* Permissions — desktop only */}
                <span className="hidden sm:inline-flex">
                  <PermissionsToggle size="sm" />
                </span>

                {/* Branch pill — desktop only */}
                {branchName && (
                  <span className="codex-pill hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] cursor-default">
                    <Icon icon="lucide:git-branch" width={12} height={12} />
                    {branchName}
                  </span>
                )}
              </div>

              {/* Send button */}
              <motion.button
                onClick={startOrSend}
                whileTap={{ scale: 0.9 }}
                aria-label={input.trim() ? 'Send message' : 'Start chat'}
                className={`codex-send-btn flex h-9 w-9 items-center justify-center rounded-xl transition-colors cursor-pointer ${
                  input.trim()
                    ? 'bg-[var(--brand)] text-[var(--brand-contrast,#fff)] hover:opacity-90'
                    : 'bg-[var(--bg)] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <Icon
                  icon={input.trim() ? 'lucide:arrow-up' : 'lucide:arrow-right'}
                  width={16}
                  height={16}
                />
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Workspace setup (no workspace) — desktop only */}
        {!hasWorkspace && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="mt-6 sm:mt-8 space-y-3 sm:space-y-4 hidden sm:block"
          >
            <div className="h-px bg-[rgba(255,255,255,0.06)]" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <motion.button
                onClick={onSelectFolder}
                whileTap={{ scale: 0.98 }}
                className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-left transition-colors duration-200 cursor-pointer hover:border-[var(--border-hover)]"
              >
                <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] border border-[var(--border)] flex items-center justify-center shrink-0">
                  <Icon
                    icon="lucide:folder-open"
                    width={20}
                    height={20}
                    className="text-[var(--text-tertiary)]"
                  />
                </div>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                    Open Folder
                  </span>
                  <span className="block text-[11px] text-[var(--text-disabled)] font-mono">
                    local project
                  </span>
                </span>
              </motion.button>
              <motion.button
                onClick={onCloneRepo}
                whileTap={{ scale: 0.98 }}
                className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-left transition-colors duration-200 cursor-pointer hover:border-[var(--border-hover)]"
              >
                <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] border border-[var(--border)] flex items-center justify-center shrink-0">
                  <Icon
                    icon="lucide:git-branch"
                    width={20}
                    height={20}
                    className="text-[var(--text-tertiary)]"
                  />
                </div>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                    Clone Repository
                  </span>
                  <span className="block text-[11px] text-[var(--text-disabled)] font-mono">
                    from GitHub
                  </span>
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Footer — subtle branding */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1 }}
          className="mt-6 sm:mt-8 hidden sm:flex justify-center"
        >
          <span className="text-[10px] font-mono tracking-[0.08em] text-[var(--text-disabled)] opacity-20 uppercase">
            Built with KnotCode
          </span>
        </motion.div>
      </div>
    </div>
  )
})
