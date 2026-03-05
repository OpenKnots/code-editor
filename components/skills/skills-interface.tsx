'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'
import { useView } from '@/context/view-context'
import { useAppMode } from '@/context/app-mode-context'
import { cn } from '@/lib/utils'
import { emit } from '@/lib/events'
import { isTauri } from '@/lib/tauri'
import {
  CODE_EDITOR_SESSION_KEY,
  CODE_EDITOR_SYSTEM_PROMPT_VERSION,
  SESSION_INIT_STORAGE_KEY,
  getEffectiveSystemPrompt,
} from '@/lib/agent-session'
import { SKILL_DISCOVERY_SUGGESTIONS, SKILLS_CATALOG, getSkillById } from '@/lib/skills/catalog'
import { buildSkillUseEnvelope } from '@/lib/skills/provider-adapter'
import type { SkillCatalogItem, SkillsRuntimeMap } from '@/lib/skills/types'
import {
  SKILLS_RUNTIME_STORAGE_KEY,
  buildCatalogSummary,
  buildExecutionPlan,
  buildSkillCommandHelp,
  mergeRuntimeState,
  parseSkillSlashCommand,
} from '@/lib/skills/workflow'

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

export function SkillsInterface({ variant = 'page' }: SkillsInterfaceProps) {
  const { sendRequest, status } = useGateway()
  const { setView } = useView()
  const { mode } = useAppMode()
  const isDesktop = isTauri()
  const preferTerminal = isDesktop && mode !== 'tui'

  const [query, setQuery] = useState('')
  const [modelName, setModelName] = useState('')
  const [actionNote, setActionNote] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [runtimeState, setRuntimeState] = useState<SkillsRuntimeMap>(() =>
    mergeRuntimeState(
      SKILLS_CATALOG.map((skill) => skill.id),
      loadStoredRuntimeState(),
    ),
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

  const refreshState = useCallback(() => {
    setRuntimeState(
      mergeRuntimeState(
        SKILLS_CATALOG.map((skill) => skill.id),
        loadStoredRuntimeState(),
      ),
    )
    setActionNote('Refreshed local skill state.')
  }, [])

  useEffect(() => {
    if (status !== 'connected') return
    let cancelled = false
    ;(async () => {
      try {
        const session = (await sendRequest('sessions.status', {
          sessionKey: CODE_EDITOR_SESSION_KEY,
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
  }, [sendRequest, status])

  const ensureCodeEditorSessionInit = useCallback(async () => {
    if (typeof window === 'undefined') return
    const initKey = `${SESSION_INIT_STORAGE_KEY}:${CODE_EDITOR_SESSION_KEY}:v${CODE_EDITOR_SYSTEM_PROMPT_VERSION}`
    if (sessionStorage.getItem(initKey)) return

    await sendRequest('chat.inject', {
      sessionKey: CODE_EDITOR_SESSION_KEY,
      message: getEffectiveSystemPrompt(),
      label: 'KnotCode system prompt',
    })
    sessionStorage.setItem(initKey, 'true')
    sendRequest('sessions.patch', {
      key: CODE_EDITOR_SESSION_KEY,
      label: 'KnotCode',
    }).catch(() => {})
  }, [sendRequest])

  const sendGatewayMessage = useCallback(
    async (message: string, label: string) => {
      if (status !== 'connected') {
        setActionNote('Gateway is disconnected. Reconnect before using gateway skill workflows.')
        return
      }

      const sessionKey = mode === 'tui' ? 'main' : CODE_EDITOR_SESSION_KEY
      if (sessionKey === CODE_EDITOR_SESSION_KEY) {
        await ensureCodeEditorSessionInit()
      }

      await sendRequest('chat.send', {
        sessionKey,
        message,
        idempotencyKey: `skills-ui-${Date.now()}`,
      })

      setView(mode === 'tui' ? 'editor' : 'chat')
      setActionNote(label)
    },
    [ensureCodeEditorSessionInit, mode, sendRequest, setView, status],
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
    [preferTerminal, sendGatewayMessage, updateRuntime],
  )

  const handleToggleEnabled = useCallback(
    (skillId: string) => {
      updateRuntime(skillId, (previous) => ({
        ...previous,
        enabled: !previous.enabled,
      }))
    },
    [updateRuntime],
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
    await executeParsedCommand('/skill update', 'Skill update command dispatched.')
  }, [executeParsedCommand])

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
    if (!lowered) return SKILLS_CATALOG
    return SKILLS_CATALOG.filter((skill) => {
      if (skill.title.toLowerCase().includes(lowered)) return true
      if (skill.shortDescription.toLowerCase().includes(lowered)) return true
      if (skill.slug.toLowerCase().includes(lowered)) return true
      return skill.tags.some((tag) => tag.includes(lowered))
    })
  }, [query])

  const selectedSkill = composer.skillId ? getSkillById(composer.skillId) : undefined
  const composerEnvelope =
    selectedSkill && composer.request.trim()
      ? buildSkillUseEnvelope({
          skill: selectedSkill,
          request: composer.request.trim(),
          modelName,
        })
      : null

  return (
    <div className={cn('space-y-4', variant === 'page' ? 'h-full p-4' : '')}>
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
              onClick={refreshState}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
            >
              <Icon icon="lucide:refresh-cw" width={12} height={12} />
              Refresh
            </button>
            <button
              onClick={handleCheck}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
            >
              <Icon icon="lucide:shield-check" width={12} height={12} />
              Check
            </button>
            <button
              onClick={handleUpdate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
            >
              <Icon icon="lucide:download" width={12} height={12} />
              Update
            </button>
            <button
              onClick={handleNewSkill}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-[11px] font-medium text-[var(--brand-contrast)] hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Icon icon="lucide:plus" width={12} height={12} />
              New skill
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
            <Icon
              icon="lucide:search"
              width={14}
              height={14}
              className="text-[var(--text-disabled)]"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills"
              className="w-full bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-disabled)]"
            />
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[10px] text-[var(--text-tertiary)]">
            {modelName ? `Adapter: ${modelName}` : 'Adapter: gateway-default'}
          </div>
        </div>

        {actionNote && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap">
            {actionNote}
          </div>
        )}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Installed</h3>
            <p className="text-[10px] text-[var(--text-disabled)]">
              Bundled skill collection. Toggle availability, sync to your local skill runner, or
              send a skill directly to chat.
            </p>
          </div>
          {busyAction && (
            <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--text-disabled)]">
              <Icon icon="lucide:loader-2" width={11} height={11} className="animate-spin" />
              {busyAction}
            </span>
          )}
        </div>

        <div
          className={cn(
            'grid gap-3',
            variant === 'page' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1',
          )}
        >
          {filteredSkills.map((skill) => {
            const state = runtimeState[skill.id]
            return (
              <article
                key={skill.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]">
                    <Icon icon={skill.icon} width={18} height={18} />
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
                        onClick={() => handleToggleEnabled(skill.id)}
                        className={cn(
                          'relative h-5 w-9 rounded-full transition-colors cursor-pointer',
                          state?.enabled ? 'bg-[var(--brand)]' : 'bg-[var(--bg-tertiary)]',
                        )}
                        title={state?.enabled ? 'Disable skill' : 'Enable skill'}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                            state?.enabled ? 'translate-x-4' : 'translate-x-0.5',
                          )}
                        />
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {skill.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 text-[9px] text-[var(--text-tertiary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleOpenComposer(skill)}
                        disabled={!state?.enabled}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer',
                          state?.enabled
                            ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed',
                        )}
                      >
                        <Icon icon="lucide:play" width={11} height={11} />
                        Use
                      </button>
                      <button
                        onClick={() => handleSyncSkill(skill)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
                      >
                        <Icon
                          icon={state?.synced ? 'lucide:rotate-cw' : 'lucide:download'}
                          width={11}
                          height={11}
                        />
                        {state?.synced ? 'Resync' : 'Sync'}
                      </button>
                      <a
                        href={skill.skillPageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-colors"
                      >
                        <Icon icon="lucide:external-link" width={11} height={11} />
                        Docs
                      </a>
                    </div>

                    <div className="mt-3 space-y-1 text-[10px] text-[var(--text-disabled)]">
                      <div>
                        Install: <code className="font-mono">{skill.installCommand}</code>
                      </div>
                      <div>
                        Status:{' '}
                        {state?.synced
                          ? `synced${state.syncedAt ? ` at ${new Date(state.syncedAt).toLocaleTimeString()}` : ''}`
                          : 'not yet synced'}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="space-y-3 pt-2">
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Recommended</h3>
          <p className="text-[10px] text-[var(--text-disabled)]">
            Use `find-skills` to search the wider ecosystem for missing workflows.
          </p>
        </div>

        <div
          className={cn(
            'grid gap-3',
            variant === 'page' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1',
          )}
        >
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
                onClick={() => handleSuggestion(suggestion.query)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
              >
                <Icon icon="lucide:plus" width={11} height={11} />
                Search
              </button>
            </article>
          ))}
        </div>
      </section>

      {selectedSkill && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-[620px] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  {selectedSkill.title}
                </h3>
                <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                  {selectedSkill.shortDescription}
                </p>
              </div>
              <button
                onClick={() => setComposer({ skillId: null, request: '' })}
                className="rounded-lg p-1.5 text-[var(--text-disabled)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-secondary)] cursor-pointer"
              >
                <Icon icon="lucide:x" width={14} height={14} />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                What should this skill help with?
              </label>
              <textarea
                value={composer.request}
                onChange={(e) =>
                  setComposer((previous) => ({ ...previous, request: e.target.value }))
                }
                rows={5}
                placeholder={selectedSkill.starterPrompt}
                className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-disabled)]"
              />
            </div>

            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11px] text-[var(--text-tertiary)]">
              {composerEnvelope
                ? `Provider adapter: ${composerEnvelope.provider.label}`
                : `Provider adapter: ${modelName || 'gateway-default'}`}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setComposer({ skillId: null, request: '' })}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleUseSkill()}
                disabled={!composer.request.trim()}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer',
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
      )}
    </div>
  )
}
