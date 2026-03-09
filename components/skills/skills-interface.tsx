'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'
import { useView } from '@/context/view-context'
import { useAppMode } from '@/context/app-mode-context'
import { cn } from '@/lib/utils'
import { emit } from '@/lib/events'
import { isTauri } from '@/lib/tauri'
import { useThread } from '@/context/thread-context'
import {
  CODE_EDITOR_SESSION_KEY,
  CODE_EDITOR_SYSTEM_PROMPT_VERSION,
  SESSION_INIT_STORAGE_KEY,
  getEffectiveSystemPrompt,
} from '@/lib/agent-session'
import {
  SKILL_DISCOVERY_SUGGESTIONS,
  SKILLS_CATALOG,
  getSkillById,
  getSkillDisplayIcon,
  getSkillPresentationMeta,
} from '@/lib/skills/catalog'
import { buildSkillUseEnvelope } from '@/lib/skills/provider-adapter'
import type { SkillCatalogItem, SkillPresentationLane, SkillsRuntimeMap } from '@/lib/skills/types'
import {
  SKILLS_RUNTIME_STORAGE_KEY,
  buildCatalogSummary,
  buildExecutionPlan,
  buildSkillCommandHelp,
  mergeRuntimeState,
  parseSkillSlashCommand,
} from '@/lib/skills/workflow'

const SKILL_IDS = SKILLS_CATALOG.map((skill) => skill.id)

const PAGE_FILTERS: Array<{ id: 'all' | SkillPresentationLane; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'popular', label: 'Popular' },
  { id: 'trending', label: 'Trending' },
  { id: 'recent', label: 'Recent' },
]

interface SkillsInterfaceProps {
  variant?: 'page' | 'settings'
}

function loadStoredRuntimeState(): SkillsRuntimeMap | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SKILLS_RUNTIME_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SkillsRuntimeMap
  } catch {
    return null
  }
}

function formatRelativeTimestamp(timestamp?: number): string {
  if (!timestamp) return 'Not yet synced'
  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  if (diffMinutes < 1) return 'Synced just now'
  if (diffMinutes < 60) return `Synced ${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `Synced ${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `Synced ${diffDays}d ago`
}

function formatActivityAge(timestamp?: number): string {
  if (!timestamp) return 'Ready for chat use'
  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  if (diffMinutes < 1) return 'Used just now'
  if (diffMinutes < 60) return `Used ${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `Used ${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `Used ${diffDays}d ago`
}

function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-[220px] items-center gap-3 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] px-4 py-3 shadow-[var(--shadow-xs)] backdrop-blur',
        className,
      )}
    >
      <Icon
        icon="lucide:search"
        width={16}
        height={16}
        className="shrink-0 text-[var(--text-disabled)]"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-disabled)]"
      />
    </div>
  )
}

function PageSkillCard({
  skill,
  state,
  busyAction,
  onToggle,
  onUse,
  onSync,
}: {
  skill: SkillCatalogItem
  state: SkillsRuntimeMap[string]
  busyAction: string | null
  onToggle: () => void
  onUse: () => void
  onSync: () => void
}) {
  const meta = getSkillPresentationMeta(skill)
  const enabled = state?.enabled ?? true
  const initials = meta.creatorName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <article className="group rounded-[22px] border border-[var(--border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_92%,transparent),color-mix(in_srgb,var(--bg)_92%,transparent))] p-3.5 shadow-[var(--shadow-sm)] transition duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--brand)_35%,var(--border))] hover:shadow-[var(--shadow-md)] sm:rounded-[26px] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--brand)_24%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--brand)]">
            <Icon icon={getSkillDisplayIcon(skill)} width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[color-mix(in_srgb,var(--brand)_24%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                {meta.lane}
              </span>
              {state?.synced ? (
                <span className="rounded-full border border-[color-mix(in_srgb,var(--color-additions,#22c55e)_30%,var(--border))] bg-[color-mix(in_srgb,var(--color-additions,#22c55e)_10%,transparent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-additions,#22c55e)]">
                  Installed
                </span>
              ) : null}
            </div>
            <h3 className="mt-3 text-[15px] font-semibold leading-5 text-[var(--text-primary)]">
              {skill.title}
            </h3>
          </div>
        </div>

        <a
          href={skill.skillPageUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-tertiary)] transition hover:border-[var(--text-disabled)] hover:text-[var(--text-primary)]"
          aria-label={`Open docs for ${skill.title}`}
        >
          <Icon icon="lucide:arrow-up-right" width={14} height={14} />
        </a>
      </div>

      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
        {skill.shortDescription}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {skill.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-[color-mix(in_srgb,var(--text-primary)_7%,transparent)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-tertiary)]"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-3 grid gap-2 grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-disabled)]">
            Collection
          </div>
          <div className="mt-0.5 truncate text-[12px] text-[var(--text-primary)]">
            {meta.collectionLabel}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-disabled)]">
            Update
          </div>
          <div className="mt-0.5 truncate text-[12px] text-[var(--text-primary)]">
            {meta.updatedLabel}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_84%,transparent)] px-3 py-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--brand)_16%,transparent)] text-[10px] font-semibold text-[var(--brand)]">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">
            {meta.creatorName}
          </div>
          <div className="truncate text-[11px] text-[var(--text-tertiary)]">
            {meta.creatorHandle} via {skill.sourceLabel}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={onToggle}
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${skill.title}`}
          disabled={state?.syncState === 'running'}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-medium transition disabled:cursor-wait disabled:opacity-60',
            enabled
              ? 'border-[color-mix(in_srgb,var(--brand)_34%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] text-[var(--text-primary)]'
              : 'border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_84%,transparent)] text-[var(--text-tertiary)]',
          )}
        >
          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              enabled ? 'bg-[var(--brand)]' : 'bg-[var(--text-disabled)]',
            )}
          />
          {enabled ? 'Enabled' : 'Disabled'}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onUse}
            type="button"
            disabled={!enabled}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-semibold transition',
              enabled
                ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90'
                : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed',
            )}
          >
            <Icon icon="lucide:play" width={12} height={12} />
            Use
          </button>
          <button
            onClick={onSync}
            type="button"
            disabled={state?.syncState === 'running'}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3.5 py-2 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--text-disabled)] hover:text-[var(--text-primary)] disabled:cursor-wait disabled:opacity-60"
          >
            <Icon
              icon={
                state?.syncState === 'running'
                  ? 'lucide:loader-2'
                  : state?.synced
                    ? 'lucide:rotate-cw'
                    : 'lucide:download'
              }
              width={12}
              height={12}
              className={state?.syncState === 'running' ? 'animate-spin' : undefined}
            />
            {state?.syncState === 'running' ? 'Syncing' : state?.synced ? 'Resync' : 'Sync'}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-tertiary)]">
        <span>{formatActivityAge(state?.lastUsedAt)}</span>
        <span>
          {state?.syncState === 'error'
            ? state.lastError
            : formatRelativeTimestamp(state?.syncedAt)}
        </span>
      </div>

      {busyAction && state?.syncState === 'running' ? (
        <div className="mt-3 text-[10px] text-[var(--text-disabled)]">{busyAction}</div>
      ) : null}
    </article>
  )
}

function SettingsSkillCard({
  skill,
  state,
  onToggle,
  onUse,
  onSync,
}: {
  skill: SkillCatalogItem
  state: SkillsRuntimeMap[string]
  onToggle: () => void
  onUse: () => void
  onSync: () => void
}) {
  const enabled = state?.enabled ?? true
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]">
          <Icon icon={getSkillDisplayIcon(skill)} width={18} height={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
                {skill.title}
              </h4>
              <p className="mt-0.5 text-[10px] text-[var(--text-disabled)]">
                {skill.shortDescription}
              </p>
            </div>
            <button
              onClick={onToggle}
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`${enabled ? 'Disable' : 'Enable'} ${skill.title}`}
              disabled={state?.syncState === 'running'}
              className={cn(
                'relative h-5 w-9 rounded-full transition-colors disabled:cursor-wait disabled:opacity-60',
                enabled
                  ? 'bg-[var(--brand)]'
                  : 'bg-[color-mix(in_srgb,var(--text-disabled)_22%,transparent)]',
              )}
            >
              <span
                className={cn(
                  'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[var(--bg-elevated)] shadow-sm transition-transform',
                  enabled ? 'translate-x-4' : 'translate-x-0',
                )}
              />
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {skill.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[9px] text-[var(--text-tertiary)]"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={onUse}
              type="button"
              disabled={!enabled}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors',
                enabled
                  ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed',
              )}
            >
              <Icon icon="lucide:play" width={11} height={11} />
              Use
            </button>
            <button
              onClick={onSync}
              type="button"
              disabled={state?.syncState === 'running'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--text-disabled)] hover:text-[var(--text-primary)] disabled:cursor-wait disabled:opacity-60"
            >
              <Icon
                icon={
                  state?.syncState === 'running'
                    ? 'lucide:loader-2'
                    : state?.synced
                      ? 'lucide:rotate-cw'
                      : 'lucide:download'
                }
                width={11}
                height={11}
                className={state?.syncState === 'running' ? 'animate-spin' : undefined}
              />
              {state?.syncState === 'running' ? 'Syncing...' : state?.synced ? 'Resync' : 'Sync'}
            </button>
            <a
              href={skill.skillPageUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-tertiary)] transition-colors hover:border-[var(--text-disabled)] hover:text-[var(--text-primary)]"
            >
              <Icon icon="lucide:external-link" width={11} height={11} />
              Docs
            </a>
          </div>

          <div className="mt-3 space-y-1 text-[10px] text-[var(--text-disabled)]">
            <div>
              {state?.synced ? formatRelativeTimestamp(state.syncedAt) : 'Not yet synced locally'}
            </div>
            <div>
              Install: <code className="font-mono">{skill.installCommand}</code>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

export function SkillsInterface({ variant = 'page' }: SkillsInterfaceProps) {
  const { sendRequest, status } = useGateway()
  const { activeThreadId } = useThread()
  const { setView } = useView()
  const { mode } = useAppMode()
  const isDesktop = isTauri()
  const preferTerminal = isDesktop && mode !== 'tui'
  const isPage = variant === 'page'
  const codeEditorSessionKey = `${CODE_EDITOR_SESSION_KEY}:${activeThreadId}`

  const [query, setQuery] = useState('')
  const [modelName, setModelName] = useState('')
  const [actionNote, setActionNote] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | SkillPresentationLane>('popular')
  const [runtimeState, setRuntimeState] = useState<SkillsRuntimeMap>(() =>
    mergeRuntimeState(SKILL_IDS, loadStoredRuntimeState()),
  )
  const [composer, setComposer] = useState<{ skillId: string | null; request: string }>({
    skillId: null,
    request: '',
  })

  useEffect(() => {
    try {
      localStorage.setItem(SKILLS_RUNTIME_STORAGE_KEY, JSON.stringify(runtimeState))
    } catch {}
  }, [runtimeState])

  const refreshState = useCallback((note: string | null = 'Refreshed local skill state.') => {
    setRuntimeState(mergeRuntimeState(SKILL_IDS, loadStoredRuntimeState()))
    if (note !== null) setActionNote(note)
  }, [])

  useEffect(() => {
    if (status !== 'connected') return
    let cancelled = false
    ;(async () => {
      try {
        const session = (await sendRequest('sessions.status', {
          sessionKey: codeEditorSessionKey,
        })) as Record<string, unknown> | undefined
        if (cancelled) return
        const nextModel =
          (session?.model as string) || (session?.defaultModel as string) || 'gateway-default'
        setModelName(nextModel)
      } catch {
        if (!cancelled) setModelName('gateway-default')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sendRequest, status, codeEditorSessionKey])

  const ensureCodeEditorSessionInit = useCallback(
    async (sessionKey: string) => {
      if (typeof window === 'undefined') return
      const initKey = `${SESSION_INIT_STORAGE_KEY}:${sessionKey}:v${CODE_EDITOR_SYSTEM_PROMPT_VERSION}`
      if (sessionStorage.getItem(initKey)) return

      await sendRequest('chat.inject', {
        sessionKey,
        message: getEffectiveSystemPrompt(),
        label: 'KnotCode system prompt',
      })
      sessionStorage.setItem(initKey, 'true')
      sendRequest('sessions.patch', {
        key: sessionKey,
        label: 'KnotCode',
      }).catch(() => {})
    },
    [sendRequest],
  )

  const sendGatewayMessage = useCallback(
    async (message: string, label: string) => {
      if (status !== 'connected') {
        setActionNote('Gateway is disconnected. Reconnect before using gateway skill workflows.')
        return
      }

      const sessionKey = mode === 'tui' ? 'main' : codeEditorSessionKey
      if (sessionKey === codeEditorSessionKey) {
        await ensureCodeEditorSessionInit(sessionKey)
      }

      await sendRequest('chat.send', {
        sessionKey,
        message,
        idempotencyKey: `skills-ui-${Date.now()}`,
      })

      setView(mode === 'tui' ? 'editor' : 'chat')
      setActionNote(label)
    },
    [ensureCodeEditorSessionInit, mode, sendRequest, setView, status, codeEditorSessionKey],
  )

  const updateRuntime = useCallback(
    (
      skillId: string,
      updater: (previous: SkillsRuntimeMap[string]) => SkillsRuntimeMap[string],
    ) => {
      setRuntimeState((previous) => ({
        ...previous,
        [skillId]: updater(previous[skillId]),
      }))
    },
    [],
  )

  const executeParsedCommand = useCallback(
    async (commandText: string, successLabel: string) => {
      const parsed = parseSkillSlashCommand(commandText)
      if (!parsed) return

      if (parsed.kind === 'help') {
        setActionNote(buildSkillCommandHelp())
        return
      }

      if (parsed.kind === 'list') {
        setActionNote(buildCatalogSummary(SKILLS_CATALOG))
        return
      }

      const plan = buildExecutionPlan(parsed, { preferTerminal })
      if (!plan) {
        setActionNote('Unknown skill command. Use /skill to see available subcommands.')
        return
      }

      setBusyAction(plan.label)
      try {
        if (plan.target === 'terminal' && plan.command) {
          window.dispatchEvent(new Event('show-terminal'))
          emit('run-command-in-terminal', { command: plan.command })

          if (plan.skill) {
            updateRuntime(plan.skill.id, (previous) => ({
              ...previous,
              synced: true,
              syncState: 'idle',
              syncedAt: Date.now(),
              lastCommand: plan.command,
              lastError: undefined,
            }))
          }

          setActionNote(successLabel || `${plan.label} started in the desktop terminal.`)
          return
        }

        if (plan.kind === 'use' && plan.skill) {
          const request = plan.query ?? ''
          if (!request) {
            setActionNote(
              'Provide a task after the skill slug. Usage: /skill use <slug> <your request>',
            )
            return
          }
          const envelope = buildSkillUseEnvelope({ skill: plan.skill, request, modelName })
          await sendGatewayMessage(
            envelope.prompt,
            successLabel || `${plan.skill.title} sent to ${envelope.provider.label}.`,
          )
          updateRuntime(plan.skill.id, (previous) => ({
            ...previous,
            lastUsedAt: Date.now(),
          }))
          return
        }

        if (plan.message) {
          await sendGatewayMessage(
            plan.message,
            successLabel || `${plan.label} sent to the gateway.`,
          )
        }
      } finally {
        setBusyAction(null)
      }
    },
    [modelName, preferTerminal, sendGatewayMessage, updateRuntime],
  )

  const handleToggleEnabled = useCallback(
    (skillId: string) => {
      const wasEnabled = runtimeState[skillId]?.enabled ?? true
      const skill = getSkillById(skillId)
      updateRuntime(skillId, (previous) => ({
        ...previous,
        enabled: !previous.enabled,
      }))
      setActionNote(`${skill?.title ?? 'Skill'} ${wasEnabled ? 'disabled' : 'enabled'}.`)
    },
    [runtimeState, updateRuntime],
  )

  const handleSyncSkill = useCallback(
    async (skill: SkillCatalogItem) => {
      updateRuntime(skill.id, (previous) => ({
        ...previous,
        syncState: 'running',
        lastError: undefined,
      }))

      try {
        await executeParsedCommand(
          `/skill install ${skill.slug}`,
          `${skill.title} sync command dispatched.`,
        )
        updateRuntime(skill.id, (previous) => ({
          ...previous,
          synced: true,
          syncState: 'idle',
          syncedAt: Date.now(),
          lastCommand: skill.installCommand,
          lastError: undefined,
        }))
      } catch (error) {
        updateRuntime(skill.id, (previous) => ({
          ...previous,
          syncState: 'error',
          lastError: error instanceof Error ? error.message : String(error),
        }))
      }
    },
    [executeParsedCommand, updateRuntime],
  )

  const handleOpenComposer = useCallback((skill: SkillCatalogItem) => {
    setComposer({ skillId: skill.id, request: '' })
  }, [])

  const handleUseSkill = useCallback(async () => {
    const skill = composer.skillId ? getSkillById(composer.skillId) : undefined
    const request = composer.request.trim()
    if (!skill || !request) return

    const envelope = buildSkillUseEnvelope({
      skill,
      request,
      modelName,
    })

    setBusyAction(`Using ${skill.title}`)
    try {
      await sendGatewayMessage(
        envelope.prompt,
        `${skill.title} sent to ${envelope.provider.label}.`,
      )
      updateRuntime(skill.id, (previous) => ({
        ...previous,
        lastUsedAt: Date.now(),
      }))
      setComposer({ skillId: null, request: '' })
    } finally {
      setBusyAction(null)
    }
  }, [composer, modelName, sendGatewayMessage, updateRuntime])

  const handleCheck = useCallback(async () => {
    await executeParsedCommand('/skill check', 'Skill update check dispatched.')
  }, [executeParsedCommand])

  const handleUpdate = useCallback(async () => {
    try {
      await executeParsedCommand('/skill update', 'Skill update command dispatched.')
    } finally {
      refreshState(null)
    }
  }, [executeParsedCommand, refreshState])

  const handleSuggestion = useCallback(
    async (suggestionQuery: string) => {
      await executeParsedCommand(
        `/skill find ${suggestionQuery}`,
        `Searching the skills ecosystem for "${suggestionQuery}".`,
      )
    },
    [executeParsedCommand],
  )

  const handleNewSkill = useCallback(() => {
    setView(mode === 'tui' ? 'editor' : 'chat')
    emit('set-agent-input', {
      text: 'First run /skill find <topic> to check existing skills. If nothing fits, create a new skill with --allow-new-skill and describe the workflow you need.',
    })
    emit('focus-agent-input')
    setActionNote('Skill authoring guidance was sent to the chat input.')
  }, [mode, setView])

  const filteredSkills = useMemo(() => {
    const lowered = query.trim().toLowerCase()
    return SKILLS_CATALOG.filter((skill) => {
      const meta = getSkillPresentationMeta(skill)
      if (activeFilter !== 'all' && meta.lane !== activeFilter) return false
      if (!lowered) return true
      if (skill.title.toLowerCase().includes(lowered)) return true
      if (skill.shortDescription.toLowerCase().includes(lowered)) return true
      if (skill.slug.toLowerCase().includes(lowered)) return true
      if (meta.collectionLabel.toLowerCase().includes(lowered)) return true
      return skill.tags.some((tag) => tag.includes(lowered))
    })
  }, [activeFilter, query])

  const selectedSkill = composer.skillId ? getSkillById(composer.skillId) : undefined
  const composerEnvelope =
    selectedSkill && composer.request.trim()
      ? buildSkillUseEnvelope({
          skill: selectedSkill,
          request: composer.request.trim(),
          modelName,
        })
      : null

  const installedCount = useMemo(
    () => Object.values(runtimeState).filter((state) => state?.synced).length,
    [runtimeState],
  )
  const enabledCount = useMemo(
    () => Object.values(runtimeState).filter((state) => state?.enabled).length,
    [runtimeState],
  )
  const resultCount = filteredSkills.length

  return (
    <div className={cn('space-y-3', isPage ? 'h-full p-3 sm:p-5 lg:p-6' : '')}>
      {isPage ? (
        <>
          <section className="relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand)_18%,var(--bg-elevated)),var(--bg-elevated)_42%,color-mix(in_srgb,var(--text-primary)_6%,transparent))] p-4 shadow-[var(--shadow-sm)] sm:rounded-[32px] sm:p-6">
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-75"
              style={{
                background:
                  'radial-gradient(circle at top right, color-mix(in srgb, var(--brand) 25%, transparent), transparent 58%)',
              }}
            />
            <div className="relative grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.75fr)]">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  <Icon
                    icon="lucide:sparkles"
                    width={14}
                    height={14}
                    className="text-[var(--brand)]"
                  />
                  Skills Library
                </div>
                <div>
                  <h1 className="max-w-3xl text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl md:text-4xl xl:text-5xl">
                    Agent skills for builders, reviewers, and workflow designers.
                  </h1>
                  <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:mt-3 sm:block md:text-[15px]">
                    Browse curated workflows, sync them locally, and send the right skill straight
                    into chat when you need planning, debugging, review, or orchestration help.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  <button
                    onClick={handleNewSkill}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-[var(--brand-contrast)] transition hover:opacity-95 sm:px-4 sm:py-2.5"
                  >
                    <Icon icon="lucide:plus" width={15} height={15} />
                    Add Skill
                  </button>
                  <button
                    onClick={handleUpdate}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_74%,transparent)] px-3.5 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--brand)] sm:px-4 sm:py-2.5"
                  >
                    <Icon icon="lucide:refresh-cw" width={15} height={15} />
                    Update Library
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
                <div className="rounded-[22px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] p-4 backdrop-blur sm:rounded-[26px] sm:p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)] sm:text-[11px]">
                    Library Pulse
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3 sm:mt-3">
                    <div>
                      <div className="text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">
                        {SKILLS_CATALOG.length}
                      </div>
                      <div className="text-[12px] text-[var(--text-tertiary)] sm:text-sm">
                        curated skills
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-[var(--text-secondary)] sm:text-[12px]">
                      <div>{installedCount} installed</div>
                      <div>{enabledCount} enabled</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] p-4 backdrop-blur sm:rounded-[26px] sm:p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)] sm:text-[11px]">
                    Active Adapter
                  </div>
                  <div className="mt-2 truncate text-base font-semibold text-[var(--text-primary)] sm:mt-3 sm:text-lg">
                    {modelName || 'gateway-default'}
                  </div>
                  <p className="mt-1 hidden text-sm leading-6 text-[var(--text-tertiary)] sm:mt-2 sm:block">
                    Use skills directly in {mode === 'tui' ? 'the terminal workflow' : 'chat'} or
                    sync them for local command execution.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] p-3 shadow-[var(--shadow-sm)] sm:rounded-[28px] sm:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <SearchField
                  value={query}
                  onChange={setQuery}
                  placeholder="Search skills by name or intent"
                  className="sm:flex-1"
                />
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {PAGE_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setActiveFilter(filter.id)}
                      className={cn(
                        'shrink-0 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition',
                        activeFilter === filter.id
                          ? 'border-[color-mix(in_srgb,var(--brand)_34%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--text-primary)]'
                          : 'border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCheck}
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--text-disabled)] hover:text-[var(--text-primary)]"
                >
                  <Icon icon="lucide:shield-check" width={12} height={12} />
                  Check
                </button>
                <div className="shrink-0 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] px-3 py-2 text-[11px] text-[var(--text-tertiary)]">
                  {resultCount} of {SKILLS_CATALOG.length}
                </div>
              </div>
            </div>

            {actionNote ? (
              <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 py-3 text-[12px] text-[var(--text-secondary)] whitespace-pre-wrap">
                {actionNote}
              </div>
            ) : null}

            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {SKILL_DISCOVERY_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.id}
                  onClick={() => void handleSuggestion(suggestion.query)}
                  type="button"
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] px-3 py-2 text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--brand)] hover:text-[var(--text-primary)]"
                >
                  <Icon icon="lucide:plus" width={12} height={12} />
                  {suggestion.title}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)] sm:text-lg">
                  Skill Catalog
                </h2>
                <p className="mt-0.5 hidden text-sm text-[var(--text-tertiary)] sm:block">
                  Browse curated workflows, inspect sources, and activate the ones you want ready.
                </p>
              </div>
              {busyAction ? (
                <span className="inline-flex items-center gap-2 text-[12px] text-[var(--text-disabled)]">
                  <Icon icon="lucide:loader-2" width={13} height={13} className="animate-spin" />
                  {busyAction}
                </span>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {filteredSkills.map((skill) => (
                <PageSkillCard
                  key={skill.id}
                  skill={skill}
                  state={runtimeState[skill.id]}
                  busyAction={busyAction}
                  onToggle={() => handleToggleEnabled(skill.id)}
                  onUse={() => handleOpenComposer(skill)}
                  onSync={() => void handleSyncSkill(skill)}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-semibold text-[var(--text-primary)]">Skills</h2>
                <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
                  Curated skills from `obra/superpowers` plus `find-skills`, adapted for GPT, Opus,
                  Sonnet, and gateway-driven workflows.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleCheck}
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--text-disabled)] hover:text-[var(--text-primary)]"
                >
                  <Icon icon="lucide:shield-check" width={12} height={12} />
                  Check
                </button>
                <button
                  onClick={handleUpdate}
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--text-disabled)] hover:text-[var(--text-primary)]"
                >
                  <Icon icon="lucide:refresh-cw" width={12} height={12} />
                  Update
                </button>
                <button
                  onClick={handleNewSkill}
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-[11px] font-medium text-[var(--brand-contrast)] transition-opacity hover:opacity-90"
                >
                  <Icon icon="lucide:plus" width={12} height={12} />
                  New skill
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search skills"
                className="flex-1 rounded-xl px-3 py-2"
              />
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[10px] text-[var(--text-tertiary)]">
                {modelName ? `Adapter: ${modelName}` : 'Adapter: gateway-default'}
              </div>
            </div>

            {actionNote ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap">
                {actionNote}
              </div>
            ) : null}
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Installed</h3>
                <p className="text-[10px] text-[var(--text-disabled)]">
                  Bundled skill collection. Toggle availability, update local installs, or send a
                  skill directly to chat.
                </p>
              </div>
              {busyAction ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--text-disabled)]">
                  <Icon icon="lucide:loader-2" width={11} height={11} className="animate-spin" />
                  {busyAction}
                </span>
              ) : null}
            </div>

            <div className="grid gap-3">
              {filteredSkills.map((skill) => (
                <SettingsSkillCard
                  key={skill.id}
                  skill={skill}
                  state={runtimeState[skill.id]}
                  onToggle={() => handleToggleEnabled(skill.id)}
                  onUse={() => handleOpenComposer(skill)}
                  onSync={() => void handleSyncSkill(skill)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3 pt-2">
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Recommended</h3>
              <p className="text-[10px] text-[var(--text-disabled)]">
                Use `find-skills` to search the wider ecosystem for missing workflows.
              </p>
            </div>

            <div className="grid gap-3">
              {SKILL_DISCOVERY_SUGGESTIONS.map((suggestion) => (
                <article
                  key={suggestion.id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4"
                >
                  <div className="min-w-0">
                    <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
                      {suggestion.title}
                    </h4>
                    <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                      {suggestion.description}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleSuggestion(suggestion.query)}
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--text-disabled)] hover:text-[var(--text-primary)]"
                  >
                    <Icon icon="lucide:plus" width={11} height={11} />
                    Search
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {selectedSkill ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-[640px] rounded-[28px] border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[18px] font-semibold text-[var(--text-primary)]">
                  {selectedSkill.title}
                </h3>
                <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
                  {selectedSkill.shortDescription}
                </p>
              </div>
              <button
                onClick={() => setComposer({ skillId: null, request: '' })}
                type="button"
                className="rounded-full border border-[var(--border)] p-2 text-[var(--text-disabled)] transition hover:bg-[var(--bg-subtle)] hover:text-[var(--text-secondary)]"
              >
                <Icon icon="lucide:x" width={14} height={14} />
              </button>
            </div>

            <div className="mt-5 space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                What should this skill help with?
              </label>
              <textarea
                value={composer.request}
                onChange={(event) =>
                  setComposer((previous) => ({ ...previous, request: event.target.value }))
                }
                rows={5}
                placeholder={selectedSkill.starterPrompt}
                className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-disabled)]"
              />
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[12px] text-[var(--text-tertiary)]">
              {composerEnvelope
                ? `Provider adapter: ${composerEnvelope.provider.label}`
                : `Provider adapter: ${modelName || 'gateway-default'}`}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setComposer({ skillId: null, request: '' })}
                type="button"
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--text-disabled)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleUseSkill()}
                type="button"
                disabled={!composer.request.trim()}
                className={cn(
                  'rounded-xl px-4 py-2 text-[12px] font-semibold transition-colors',
                  composer.request.trim()
                    ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed',
                )}
              >
                Send to {mode === 'tui' ? 'TUI' : 'Chat'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
