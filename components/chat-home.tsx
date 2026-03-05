'use client'

import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { Icon } from '@iconify/react'
import { KnotLogo } from '@/components/knot-logo'
import { KnotBackground } from '@/components/knot-background'
import { ModeSelector } from '@/components/mode-selector'
import type { AgentMode } from '@/components/mode-selector'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { useGateway } from '@/context/gateway-context'
import { useGitHubAuth } from '@/context/github-auth-context'
import { useEditor } from '@/context/editor-context'
import { emit } from '@/lib/events'
import { getRecentFolders } from '@/context/local-context'
import { getAgentConfig } from '@/lib/agent-session'

const STATIC_SUGGESTIONS = [
  { icon: 'lucide:sparkles', label: 'Edit this', prefix: 'Edit ', desc: 'Modify selected code' },
  { icon: 'lucide:zap', label: 'Squash bug', prefix: 'Fix ', desc: 'Debug and fix issues' },
  {
    icon: 'lucide:wand-2',
    label: 'Test it',
    prefix: 'Write tests for ',
    desc: 'Generate test cases',
  },
  { icon: 'lucide:star', label: 'Review PR', prefix: 'Review ', desc: 'Analyze pull request' },
]
const TOKEN_REVEAL_TIMEOUT_MS = 15000

/** Get recent conversation previews from localStorage */
function getRecentConversations(): Array<{
  title: string
  timestamp: number
  messageCount: number
}> {
  try {
    const saved = localStorage.getItem('code-editor:chat:main')
    if (!saved) return []
    const messages = JSON.parse(saved) as Array<{
      role: string
      content: string
      timestamp: number
    }>
    if (!messages.length) return []
    const firstUser = messages.find((m) => m.role === 'user')
    if (!firstUser) return []
    return [
      {
        title: firstUser.content.slice(0, 60).replace(/\n/g, ' '),
        timestamp: messages[messages.length - 1].timestamp,
        messageCount: messages.length,
      },
    ]
  } catch {
    return []
  }
}

/** Detect primary language from file extensions */
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

function IconButton({
  icon,
  title,
  size = 14,
  onClick,
  className = '',
}: {
  icon: string
  title: string
  size?: number
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded-md text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] transition-colors cursor-pointer ${className}`}
      title={title}
      aria-label={title}
    >
      <Icon icon={icon} width={size} height={size} />
    </button>
  )
}

interface Props {
  onSend: (text: string, mode: AgentMode) => void
  onSelectFolder: () => void
  onCloneRepo: () => void
}

export const ChatHome = memo(function ChatHome({ onSend, onSelectFolder, onCloneRepo }: Props) {
  const [input, setInput] = useState('')
  const [agentMode, setAgentMode] = useState<AgentMode>('agent')
  const [isFocused, setIsFocused] = useState(false)
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [tokenDraft, setTokenDraft] = useState('')
  const [tokenRevealed, setTokenRevealed] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [ghSectionOpen, setGhSectionOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const { repo } = useRepo()
  const local = useLocal()
  const { status } = useGateway()
  const { token: ghToken, authenticated, setManualToken, clearToken } = useGitHubAuth()
  const { files: openFiles } = useEditor()

  const repoShort = useMemo(
    () => repo?.fullName?.split('/').pop() ?? local.rootPath?.split('/').pop() ?? null,
    [repo?.fullName, local.rootPath],
  )
  const hasWorkspace = !!repoShort

  const [recentFolders, setRecentFolders] = useState<string[]>(() => getRecentFolders())
  const [recentConversations, setRecentConversations] = useState(() => getRecentConversations())
  const agentConfig = useMemo(() => getAgentConfig(), [])

  useEffect(() => {
    setRecentFolders(getRecentFolders())
    setRecentConversations(getRecentConversations())
  }, [local.rootPath])

  // Workspace stats
  const wsTreeFiles = local.localTree?.filter((e) => !e.is_dir) ?? []
  const fileCount = wsTreeFiles.length
  const primaryLanguage = useMemo(
    () => detectPrimaryLanguage(local.localTree ?? []),
    [local.localTree],
  )
  const branchName = local.gitInfo?.branch ?? null

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!tokenRevealed) return
    const timer = setTimeout(() => setTokenRevealed(false), TOKEN_REVEAL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [tokenRevealed])

  useEffect(() => {
    if (!tokenCopied) return
    const timer = setTimeout(() => setTokenCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [tokenCopied])

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

  const handleSubmit = useCallback(() => {
    const t = input.trim()
    if (!t) return
    onSend(t, agentMode)
    setInput('')
  }, [input, agentMode, onSend])

  const handleSaveToken = useCallback(() => {
    const trimmed = tokenDraft.trim()
    if (!trimmed) return
    setManualToken(trimmed)
    setTokenDraft('')
    setShowTokenInput(false)
    setTokenRevealed(false)
    setTokenCopied(false)
  }, [tokenDraft, setManualToken])

  const handleToggleReveal = useCallback(() => {
    if (tokenRevealed) {
      setTokenRevealed(false)
      return
    }
    const ok = window.confirm('Reveal token for 15 seconds? Avoid this while screen sharing.')
    if (ok) setTokenRevealed(true)
  }, [tokenRevealed])

  const handleCopyToken = useCallback(async () => {
    if (!ghToken) return
    try {
      await navigator.clipboard.writeText(ghToken)
      setTokenCopied(true)
    } catch {
      // Ignore clipboard errors (unsupported context or denied permission).
    }
  }, [ghToken])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
      if (e.key === 'Tab' && !input.trim()) {
        e.preventDefault()
        setAgentMode((m) => (m === 'ask' ? 'agent' : 'ask'))
      }
    },
    [handleSubmit, input],
  )

  const maskedToken = ghToken
    ? `${ghToken.slice(0, 4)}${'•'.repeat(Math.min(ghToken.length - 8, 24))}${ghToken.slice(-4)}`
    : ''

  // Context-aware suggestions: use open files and local tree when a workspace is active
  const suggestions = useMemo(() => {
    if (!hasWorkspace) return STATIC_SUGGESTIONS

    const contextChips: typeof STATIC_SUGGESTIONS = []

    // Suggest editing open files
    if (openFiles.length > 0) {
      const recent = openFiles[openFiles.length - 1]
      const name = recent.path.split('/').pop() || recent.path
      contextChips.push({
        icon: 'lucide:sparkles',
        label: `Edit ${name}`,
        prefix: `Edit ${recent.path} `,
        desc: 'Modify this file',
      })
    }

    // Suggest explaining a notable file from the tree
    const ctxTreeFiles = local.localTree?.filter((e) => !e.is_dir) ?? []
    const interesting = ctxTreeFiles.find(
      (f) =>
        /\.(ts|tsx|rs|py|go)$/.test(f.path) &&
        !f.path.includes('node_modules') &&
        !f.path.includes('.lock'),
    )
    if (interesting) {
      const name = interesting.path.split('/').pop() || interesting.path
      contextChips.push({
        icon: 'lucide:flame',
        label: `Explain ${name}`,
        prefix: `Explain ${interesting.path} `,
        desc: 'Understand code flow',
      })
    }

    contextChips.push(
      { icon: 'lucide:zap', label: 'Squash bug', prefix: 'Fix ', desc: 'Debug and fix issues' },
      {
        icon: 'lucide:wand-2',
        label: 'Test it',
        prefix: 'Write tests for ',
        desc: 'Generate test cases',
      },
      { icon: 'lucide:star', label: 'Review PR', prefix: 'Review ', desc: 'Analyze pull request' },
    )

    return contextChips.slice(0, 4)
  }, [hasWorkspace, openFiles, local.localTree])

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-8 sm:py-10 pb-16 sm:pb-20 relative">
      <KnotBackground />
      <div className="min-h-full w-full max-w-[700px] mx-auto flex flex-col justify-center relative z-[1]">
        {/* Logo + Heading */}
        <div className="flex flex-col items-center mb-3">
          <div
            className={`mb-2.5 text-[var(--text-tertiary)] ${
              status === 'connected' ? 'logo-breathe-connected' : 'logo-breathe-idle'
            }`}
          >
            <KnotLogo size={42} />
          </div>
          <h1 className="text-center text-[22px] font-bold text-[var(--text-primary)] tracking-[-0.02em] leading-tight flex items-center gap-2 justify-center">
            <span className="bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-secondary)] bg-clip-text text-transparent">
              KnotCode
            </span>
          </h1>
          <p className="mt-1.5 text-center text-[13px] text-[var(--text-secondary)] font-medium">
            {repoShort ? `What should we work on?` : `What do you want to build?`}
          </p>

          {/* Workspace stats — single compact row */}
          <div className="mt-2 flex items-center justify-center gap-2.5 flex-wrap text-[11px] text-[var(--text-disabled)]">
            {hasWorkspace && (fileCount > 0 || primaryLanguage || branchName) && (
              <>
                {fileCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px]">
                    <Icon icon="lucide:files" width={10} height={10} />
                    {fileCount} files
                  </span>
                )}
                {primaryLanguage && (
                  <span className="inline-flex items-center gap-1 text-[10px]">
                    <Icon icon="lucide:code-2" width={10} height={10} />
                    {primaryLanguage}
                  </span>
                )}
                {branchName && (
                  <span className="inline-flex items-center gap-1 text-[10px]">
                    <Icon icon="lucide:git-branch" width={10} height={10} />
                    {branchName}
                  </span>
                )}
              </>
            )}
            {hasWorkspace ? (
              <button
                onClick={onSelectFolder}
                className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <Icon icon="lucide:folder-git-2" width={11} height={11} />
                {repoShort}
              </button>
            ) : (
              <span className="text-[11px] text-[var(--text-disabled)]">
                KnotCode — AI-powered editor
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 ${
                status === 'connected' ? 'text-[var(--success)]' : 'text-[var(--text-disabled)]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-[var(--success)]' : 'bg-[var(--text-disabled)]'}`}
              />
              {status === 'connected' ? 'Gateway connected' : 'Gateway offline'}
            </span>
            {agentConfig && (
              <button
                onClick={() => emit('open-agent-settings')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_6%,transparent)] text-[var(--brand)] hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] transition-colors cursor-pointer"
              >
                <span className="text-[10px]">
                  {agentConfig.persona === 'fullstack'
                    ? '\u{1F525}'
                    : agentConfig.persona === 'frontend'
                      ? '\u{1F3AF}'
                      : agentConfig.persona === 'security'
                        ? '\u{1F6E1}\u{FE0F}'
                        : agentConfig.persona === 'architect'
                          ? '\u{1F3D7}\u{FE0F}'
                          : '\u{2728}'}
                </span>
                <span className="text-[10px] font-medium">
                  {agentConfig.persona === 'fullstack'
                    ? 'Full-Stack Engineer'
                    : agentConfig.persona === 'frontend'
                      ? 'Frontend Specialist'
                      : agentConfig.persona === 'security'
                        ? 'Security Engineer'
                        : agentConfig.persona === 'architect'
                          ? 'Systems Architect'
                          : 'Custom Agent'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Composer card */}
        <div
          ref={cardRef}
          className={`chat-input-card rounded-xl border bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] overflow-hidden ${
            isFocused
              ? input.trim()
                ? 'chat-input-card-typing border-[color-mix(in_srgb,var(--brand)_30%,var(--border))]'
                : 'chat-input-card-focused border-[color-mix(in_srgb,var(--brand)_20%,var(--border))]'
              : 'border-[var(--border)]'
          }`}
        >
          <div className="px-4 pt-3 pb-0.5 flex items-center justify-between gap-2 text-[10px] text-[var(--text-disabled)]">
            <span className="truncate">
              {hasWorkspace ? `Context: ${repoShort}` : 'Tip: Press Tab to toggle mode'}
            </span>
            <span className="hidden sm:inline shrink-0">Shift+Enter adds a new line</span>
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={
              repoShort ? `Ask anything about ${repoShort}…` : 'Describe what you want to build…'
            }
            aria-label={
              repoShort ? `Ask anything about ${repoShort}` : 'Describe what you want to build'
            }
            className="w-full bg-transparent px-4 pt-2 pb-1 text-[14px] leading-[1.6] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none resize-none min-h-[52px] max-h-[200px] overflow-y-auto"
          />

          {/* Toolbar */}
          <div className="px-3 pb-2 pt-0.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-0.5">
                <IconButton icon="lucide:paperclip" title="Attach file" />
                <IconButton icon="lucide:image-plus" title="Attach image" />
                <IconButton icon="lucide:at-sign" title="@ mention file" />
                <div className="w-px h-4 bg-[var(--border)] mx-1" />
                <ModeSelector mode={agentMode} onChange={setAgentMode} size="sm" />
              </div>

              <button
                onClick={handleSubmit}
                disabled={!input.trim()}
                aria-label="Send message"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  input.trim()
                    ? 'bg-[var(--text-primary)] text-[var(--bg)] shadow-sm hover:opacity-90 active:scale-95'
                    : 'bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] cursor-not-allowed'
                }`}
              >
                <Icon icon="lucide:arrow-up" width={14} height={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Quick action cards */}
        <div className="mt-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {suggestions.slice(0, 4).map((a, i) => (
              <button
                key={a.label}
                onClick={() => {
                  setInput(a.prefix)
                  inputRef.current?.focus()
                }}
                aria-label={`${a.label}: ${a.prefix}`}
                className="quick-action-card chip-enter flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)] hover:text-[var(--text-primary)] cursor-pointer"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div className="w-7 h-7 rounded-md bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] flex items-center justify-center shrink-0">
                  <Icon icon={a.icon} width={14} height={14} className="text-[var(--brand)]" />
                </div>
                <div className="text-left min-w-0">
                  <div className="text-[12px] font-medium">{a.label}</div>
                  {'desc' in a && a.desc && (
                    <div className="text-[10px] text-[var(--text-disabled)] mt-0.5">{a.desc}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent conversations */}
        {recentConversations.length > 0 && (
          <div className="mt-4">
            <p className="text-center text-[10px] uppercase tracking-[0.08em] text-[var(--text-disabled)] font-medium mb-2">
              Continue
            </p>
            {recentConversations.map((conv, i) => (
              <button
                key={i}
                onClick={() => {
                  // Conversation already loaded — just scroll user into the chat
                  onSend('', agentMode)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] transition-colors cursor-pointer group"
              >
                <Icon
                  icon="lucide:message-square"
                  width={13}
                  height={13}
                  className="text-[var(--text-disabled)] group-hover:text-[var(--text-tertiary)] shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate">
                    {conv.title}
                  </div>
                  <div className="text-[10px] text-[var(--text-disabled)]">
                    {conv.messageCount} messages · {new Date(conv.timestamp).toLocaleDateString()}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Workspace actions — shown when no folder/repo is open */}
        {!hasWorkspace && (
          <div className="mt-6 border-t border-[var(--border)] pt-4 space-y-3">
            <div>
              <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">
                Set up your workspace
              </h2>
              <p className="text-[11px] text-[var(--text-disabled)] mt-1">
                Open local files or clone a repository to unlock context-aware help.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={onSelectFolder}
                className="group flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-left hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
              >
                <Icon
                  icon="lucide:folder-open"
                  width={14}
                  height={14}
                  className="text-[var(--text-tertiary)]"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                    Open Folder
                  </span>
                  <span className="block text-[11px] text-[var(--text-disabled)]">
                    Continue from a local project
                  </span>
                </span>
              </button>
              <button
                onClick={onCloneRepo}
                className="group flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-left hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
              >
                <Icon
                  icon="lucide:git-branch"
                  width={14}
                  height={14}
                  className="text-[var(--text-tertiary)]"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                    Clone Repository
                  </span>
                  <span className="block text-[11px] text-[var(--text-disabled)]">
                    Pull from GitHub and start coding
                  </span>
                </span>
              </button>
            </div>

            {/* Recent folders */}
            {recentFolders.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-disabled)] font-medium mb-2">
                  Recent
                </p>
                <div className="flex flex-col gap-0.5">
                  {recentFolders.slice(0, 3).map((folder) => {
                    const name = folder.split('/').pop() || folder
                    const parent = folder.split('/').slice(0, -1).join('/') || '/'
                    return (
                      <button
                        key={folder}
                        onClick={() => local.setRootPath(folder)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] transition-colors cursor-pointer group"
                      >
                        <Icon
                          icon="lucide:folder"
                          width={14}
                          height={14}
                          className="text-[var(--text-disabled)] group-hover:text-[var(--text-tertiary)] shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-[12px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate">
                            {name}
                          </div>
                          <div className="text-[10px] text-[var(--text-disabled)] truncate">
                            {parent}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* GitHub Token — collapsed by default */}
            <div>
              <button
                onClick={() => setGhSectionOpen((v) => !v)}
                className="w-full flex items-center gap-3 cursor-pointer group"
              >
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-disabled)] font-medium group-hover:text-[var(--text-tertiary)] transition-colors">
                  GitHub
                  {authenticated && (
                    <Icon
                      icon="lucide:check-circle"
                      width={10}
                      height={10}
                      className="text-[var(--success)]"
                    />
                  )}
                  <Icon
                    icon={ghSectionOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                    width={10}
                    height={10}
                  />
                </span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </button>

              {ghSectionOpen && (
                <div className="mt-2">
                  {authenticated ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
                      <Icon
                        icon="lucide:check-circle"
                        width={14}
                        height={14}
                        className="text-[var(--success)] shrink-0"
                      />
                      <span className="text-[12px] text-[var(--text-secondary)] flex-1 font-mono truncate">
                        {tokenRevealed ? ghToken : maskedToken}
                      </span>
                      <IconButton
                        icon={tokenCopied ? 'lucide:check' : 'lucide:copy'}
                        title={tokenCopied ? 'Copied' : 'Copy token'}
                        size={13}
                        onClick={handleCopyToken}
                      />
                      <IconButton
                        icon={tokenRevealed ? 'lucide:eye-off' : 'lucide:eye'}
                        title={tokenRevealed ? 'Hide token' : 'Reveal token'}
                        size={13}
                        onClick={handleToggleReveal}
                      />
                      <button
                        onClick={() => {
                          clearToken()
                          setTokenRevealed(false)
                          setTokenCopied(false)
                        }}
                        className="p-1 rounded-md hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)] text-[var(--text-disabled)] hover:text-[var(--error)] transition-colors cursor-pointer"
                        title="Remove token"
                        aria-label="Remove token"
                      >
                        <Icon icon="lucide:x" width={13} height={13} />
                      </button>
                    </div>
                  ) : showTokenInput ? (
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 focus-within:border-[var(--border-focus)] transition-colors">
                        <Icon
                          icon="lucide:key"
                          width={13}
                          height={13}
                          className="text-[var(--text-disabled)] shrink-0"
                        />
                        <input
                          type={tokenRevealed ? 'text' : 'password'}
                          value={tokenDraft}
                          onChange={(e) => setTokenDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveToken()
                            if (e.key === 'Escape') {
                              setShowTokenInput(false)
                              setTokenDraft('')
                              setTokenRevealed(false)
                            }
                          }}
                          placeholder="ghp_... or github_pat_..."
                          autoFocus
                          className="flex-1 bg-transparent text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none min-w-0"
                          autoComplete="off"
                          spellCheck={false}
                          aria-label="GitHub personal access token"
                        />
                        <IconButton
                          icon={tokenRevealed ? 'lucide:eye-off' : 'lucide:eye'}
                          title={tokenRevealed ? 'Hide' : 'Reveal'}
                          size={13}
                          onClick={() => setTokenRevealed((v) => !v)}
                        />
                      </div>
                      <button
                        onClick={handleSaveToken}
                        disabled={!tokenDraft.trim()}
                        className={`px-3.5 py-2 rounded-xl text-[12px] font-medium transition-all cursor-pointer ${
                          tokenDraft.trim()
                            ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)]'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'
                        }`}
                      >
                        Save
                      </button>
                      <IconButton
                        icon="lucide:x"
                        title="Cancel"
                        size={13}
                        onClick={() => {
                          setShowTokenInput(false)
                          setTokenDraft('')
                          setTokenRevealed(false)
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowTokenInput(true)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[var(--border)] text-[12px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:border-[var(--text-disabled)] transition-all cursor-pointer"
                    >
                      <Icon icon="lucide:key" width={13} height={13} />
                      Add GitHub Token
                    </button>
                  )}
                  <p className="text-[10px] text-[var(--text-disabled)] text-center mt-2">
                    {authenticated
                      ? tokenRevealed
                        ? 'Token reveal auto-hides after 15s. Avoid screen sharing.'
                        : tokenCopied
                          ? 'Token copied to clipboard.'
                          : 'Desktop stores token in OS keychain. Web keeps token in memory only.'
                      : 'Required for remote repos. Generate at github.com/settings/tokens'}
                  </p>
                </div>
              )}
            </div>

            {/* Agent customization banner */}
            {!agentConfig && (
              <button
                onClick={() => emit('open-agent-settings')}
                className="agent-banner w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-[var(--border)] text-left cursor-pointer"
              >
                <Icon
                  icon="lucide:sparkles"
                  width={14}
                  height={14}
                  className="text-[var(--brand)] shrink-0"
                />
                <div className="min-w-0">
                  <span className="block text-[12px] font-medium text-[var(--text-secondary)]">
                    Customize your AI agent
                  </span>
                  <span className="block text-[10px] text-[var(--text-disabled)]">
                    Set up persona and behavior
                  </span>
                </div>
                <Icon
                  icon="lucide:chevron-right"
                  width={12}
                  height={12}
                  className="text-[var(--text-disabled)] shrink-0 ml-auto"
                />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
