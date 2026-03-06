'use client'

import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { Icon } from '@iconify/react'
import { KnotLogo } from '@/components/knot-logo'
import { KnotBackground } from '@/components/knot-background'
import { ModeSelector } from '@/components/mode-selector'
import type { AgentMode } from '@/components/mode-selector'
import { PermissionsToggle } from '@/components/permissions-toggle'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { useGateway } from '@/context/gateway-context'
import { useGitHubAuth } from '@/context/github-auth-context'
import { useEditor } from '@/context/editor-context'
import { emit } from '@/lib/events'
import { getRecentFolders } from '@/context/local-context'
import { getAgentConfig } from '@/lib/agent-session'

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
]

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
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { repo } = useRepo()
  const local = useLocal()
  const { status } = useGateway()
  const { files: openFiles } = useEditor()

  const repoShort = useMemo(
    () => repo?.fullName?.split('/').pop() ?? local.rootPath?.split('/').pop() ?? null,
    [repo?.fullName, local.rootPath],
  )
  const hasWorkspace = !!repoShort
  const branchName = local.gitInfo?.branch ?? null

  const [isComposing, setIsComposing] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(t)
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

    return contextCards.slice(0, 3)
  }, [hasWorkspace, openFiles, local.localTree, branchName])

  return (
    <div className="flex-1 overflow-y-auto relative">
      <KnotBackground />
      <div className="min-h-full w-full max-w-[720px] mx-auto flex flex-col justify-center px-4 sm:px-6 py-8 sm:py-10 md:py-12 relative z-[1]">
        {/* Header — "Let's build" */}
        <div className="flex flex-col items-center mb-6 sm:mb-7">
          <div
            className={`mb-3 ${
              status === 'connected' ? 'logo-breathe-connected' : 'logo-breathe-idle'
            }`}
          >
            <KnotLogo size={40} color="var(--brand)" />
          </div>

          <h1 className="text-center text-[32px] font-semibold tracking-[-0.04em] leading-none text-[var(--text-primary)]">
            Let&apos;s build
          </h1>

          {/* Workspace dropdown */}
          <button
            onClick={onSelectFolder}
            className="codex-workspace-dropdown mt-2.5 inline-flex items-center gap-1.5 text-[14px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            {repoShort ?? 'Select workspace'}
            <Icon icon="lucide:chevron-down" width={14} height={14} className="opacity-50" />
          </button>
        </div>

        {/* "Explore more" link */}
        <div className="flex justify-end mb-2">
          <button
            onClick={() => emit('open-folder')}
            className="text-[12px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
          >
            Explore more
          </button>
        </div>

        {/* Suggestion cards — 1-up mobile, 3-up desktop */}
        <div className="codex-suggestion-grid grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 mb-4 sm:mb-5">
          {suggestions.map((card, i) => (
            <button
              key={i}
              onClick={() => onSend(card.label, agentMode)}
              className="codex-suggestion-card group flex flex-col gap-2.5 p-3.5 sm:p-4 rounded-xl text-left cursor-pointer border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_70%,transparent)] backdrop-blur-sm hover:border-[var(--text-disabled)] transition-all w-full"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: card.bg }}
              >
                <Icon
                  icon={card.icon}
                  width={16}
                  height={16}
                  style={{ color: card.color }}
                  className="opacity-80 group-hover:opacity-100 transition-opacity"
                />
              </div>
              <p className="text-[12px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] leading-relaxed transition-colors">
                {card.label}
              </p>
            </button>
          ))}
        </div>

        {/* Composer */}
        <div
          onClick={() => inputRef.current?.focus()}
          className={`codex-composer rounded-xl border backdrop-blur-sm overflow-hidden transition-all duration-200 ${
            isFocused
              ? input.trim()
                ? 'border-[color-mix(in_srgb,var(--brand)_50%,var(--border))]'
                : 'border-[color-mix(in_srgb,var(--brand)_25%,var(--border))]'
              : 'border-[var(--border)] hover:border-[color-mix(in_srgb,var(--text-disabled)_60%,var(--border))]'
          }`}
          style={{ background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)' }}
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
                : 'Describe what you want to build…'
            }
            aria-label="Chat input"
            className="w-full bg-transparent px-4 pt-3.5 pb-2 text-[14px] leading-[1.6] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none resize-none min-h-[48px] max-h-[200px] overflow-y-auto"
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
                  className="codex-pill-btn flex items-center justify-center w-7 h-7 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:border-[var(--text-disabled)] transition-all cursor-pointer"
                  title="Attach file"
                >
                  <Icon icon="lucide:plus" width={14} height={14} />
                </button>

                {/* Mode selector */}
                <ModeSelector mode={agentMode} onChange={setAgentMode} size="sm" />

                {/* Divider */}
                <div className="w-px h-4 bg-[var(--border)]" />

                {/* Gateway status */}
                <span
                  className={`codex-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-default ${
                    status === 'connected'
                      ? 'text-[var(--text-secondary)] border-[var(--border)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]'
                      : 'text-[var(--text-disabled)] border-[var(--border)] bg-[color-mix(in_srgb,var(--text-primary)_3%,transparent)]'
                  }`}
                >
                  <Icon icon="lucide:monitor" width={12} height={12} />
                  {status === 'connected' ? 'Local' : 'Offline'}
                </span>

                {/* Permissions */}
                <PermissionsToggle size="sm" />

                {/* Branch pill */}
                {branchName && (
                  <span className="codex-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] cursor-default">
                    <Icon icon="lucide:git-branch" width={12} height={12} />
                    {branchName}
                  </span>
                )}
              </div>

              {/* Send */}
              <button
                onClick={startOrSend}
                aria-label={input.trim() ? 'Send message' : 'Start chat'}
                className={`codex-send-btn flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer active:scale-95 ${
                  input.trim()
                    ? 'bg-[var(--brand)] text-[var(--brand-contrast,#fff)] shadow-[0_0_12px_color-mix(in_srgb,var(--brand)_20%,transparent)]'
                    : 'bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)]'
                }`}
              >
                <Icon
                  icon={input.trim() ? 'lucide:arrow-up' : 'lucide:arrow-right'}
                  width={14}
                  height={14}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Workspace setup (no workspace) */}
        {!hasWorkspace && (
          <div className="mt-6 sm:mt-8 space-y-3 sm:space-y-4">
            <div className="h-px bg-[var(--border)]" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={onSelectFolder}
                className="group flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_60%,transparent)] text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-md bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] border border-[var(--border)] flex items-center justify-center shrink-0">
                  <Icon
                    icon="lucide:folder-open"
                    width={14}
                    height={14}
                    className="text-[var(--text-tertiary)]"
                  />
                </div>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                    Open Folder
                  </span>
                  <span className="block text-[10px] text-[var(--text-disabled)] font-mono">
                    local project
                  </span>
                </span>
              </button>
              <button
                onClick={onCloneRepo}
                className="group flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_60%,transparent)] text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-md bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] border border-[var(--border)] flex items-center justify-center shrink-0">
                  <Icon
                    icon="lucide:git-branch"
                    width={14}
                    height={14}
                    className="text-[var(--text-tertiary)]"
                  />
                </div>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                    Clone Repository
                  </span>
                  <span className="block text-[10px] text-[var(--text-disabled)] font-mono">
                    from GitHub
                  </span>
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 sm:mt-8 flex justify-center">
          <span className="text-[10px] font-mono tracking-[0.08em] text-[var(--text-disabled)] opacity-40 uppercase">
            KnotCode
          </span>
        </div>
      </div>
    </div>
  )
})
