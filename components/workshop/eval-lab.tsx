'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { MarkdownPreview } from '@/components/markdown-preview'
import { useGateway } from '@/context/gateway-context'
import { PERSONA_PRESETS } from '@/lib/agent-personas'
import { buildWorkshopSystemPrompt } from '@/lib/agent-workshop/prompt'
import type { WorkshopBlueprint } from '@/lib/agent-workshop/types'
import { copyToClipboard } from '@/lib/clipboard'
import { PLAYGROUND_SCENARIOS } from '@/lib/playground/data'
import { PLAYGROUND_SESSION_KEY } from '@/lib/playground/constants'
import { getSkillDisplayIcon, SKILLS_CATALOG } from '@/lib/skills/catalog'

type EvalSlot = 'primary' | 'challenger'
type ResultStatus = 'idle' | 'running' | 'complete' | 'error'

interface EvalResultState {
  content: string
  status: ResultStatus
  error: string | null
  sessionKey: string | null
}

interface PendingRun {
  slot: EvalSlot
  sessionKey: string
  idempotencyKey: string
  resolve: (value: string) => void
  reject: (error: Error) => void
}

const EMPTY_RESULT: EvalResultState = {
  content: '',
  status: 'idle',
  error: null,
  sessionKey: null,
}

function extractChatText(payload: Record<string, unknown>): string {
  const message = payload.message
  if (typeof message === 'string') return message
  if (message && typeof message === 'object') {
    const msg = message as Record<string, unknown>
    if (typeof msg.content === 'string') return msg.content
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((block) => typeof block === 'object' && block !== null)
        .map((block) => block as Record<string, unknown>)
        .filter((block) => block.type === 'text' || block.type === 'output_text')
        .map((block) => String(block.text ?? ''))
        .join('')
    }
    if (typeof msg.text === 'string') return msg.text
    if (typeof msg.output_text === 'string') return msg.output_text
  }
  if (typeof payload.reply === 'string') return payload.reply
  if (typeof payload.text === 'string') return payload.text
  if (typeof payload.content === 'string') return payload.content
  if (typeof payload.delta === 'string') return payload.delta
  return ''
}

function appendStreamChunk(previous: string, next: string): string {
  if (!previous) return next
  if (next.startsWith(previous)) return next
  if (previous.endsWith(next)) return previous
  return previous + next
}

function buildRunSessionKey(slot: EvalSlot): string {
  return `${PLAYGROUND_SESSION_KEY}:workshop:${slot}:${Date.now()}`
}

function ResultPanel({
  title,
  state,
  onCopy,
  copied,
  isVisible = true,
}: {
  title: string
  state: EvalResultState
  onCopy: () => void
  copied: boolean
  isVisible?: boolean
}) {
  if (!isVisible) return null

  const statusLabel =
    state.status === 'running'
      ? 'Streaming...'
      : state.status === 'complete'
        ? 'Complete'
        : state.status === 'error'
          ? state.error || 'Run failed'
          : 'Ready to evaluate'

  return (
    <section className="min-h-[300px] rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">{statusLabel}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          disabled={!state.content}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--brand)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} width={14} height={14} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {state.content ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <MarkdownPreview content={state.content} />
        </div>
      ) : (
        <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-6 text-center text-sm text-[var(--text-tertiary)]">
          Run an evaluation to see the agent’s output and compare how the blueprints behave under the same prompt.
        </div>
      )}
    </section>
  )
}

interface WorkshopEvaluationLabProps {
  primaryBlueprint: WorkshopBlueprint
  challengerBlueprint: WorkshopBlueprint
  compareMode: boolean
  onUpdatePrimaryBlueprint: (next: WorkshopBlueprint) => void
  onUpdateChallengerBlueprint: (next: WorkshopBlueprint) => void
  onClonePrimaryToChallenger: () => void
}

export function WorkshopEvaluationLab({
  primaryBlueprint,
  challengerBlueprint,
  compareMode,
  onUpdatePrimaryBlueprint,
  onUpdateChallengerBlueprint,
  onClonePrimaryToChallenger,
}: WorkshopEvaluationLabProps) {
  const { status, sendRequest, onEvent } = useGateway()
  const [results, setResults] = useState<Record<EvalSlot, EvalResultState>>({
    primary: EMPTY_RESULT,
    challenger: EMPTY_RESULT,
  })
  const [runningSlot, setRunningSlot] = useState<EvalSlot | null>(null)
  const [copiedSlot, setCopiedSlot] = useState<EvalSlot | null>(null)
  const resultsRef = useRef(results)
  const pendingRunRef = useRef<PendingRun | null>(null)

  useEffect(() => {
    resultsRef.current = results
  }, [results])

  useEffect(() => {
    return onEvent('chat', (payload: unknown) => {
      const pending = pendingRunRef.current
      if (!pending) return

      const event = payload as Record<string, unknown>
      const eventState = event.state as string | undefined
      const eventIdempotencyKey = (event.idempotencyKey ??
        event.idempotency_key ??
        event.idemKey) as string | undefined
      const eventSessionKey = (event.sessionKey ??
        event.session_key ??
        (typeof event.session === 'object' && event.session !== null
          ? (event.session as Record<string, unknown>).key
          : undefined)) as string | undefined

      if (
        eventIdempotencyKey !== pending.idempotencyKey &&
        eventSessionKey !== pending.sessionKey
      ) {
        return
      }

      if (eventState === 'delta') {
        const chunk = extractChatText(event)
        if (!chunk) return
        setResults((current) => ({
          ...current,
          [pending.slot]: {
            ...current[pending.slot],
            status: 'running',
            content: appendStreamChunk(current[pending.slot].content, chunk),
          },
        }))
        return
      }

      if (eventState === 'final') {
        const finalText = extractChatText(event) || resultsRef.current[pending.slot].content
        setResults((current) => ({
          ...current,
          [pending.slot]: {
            ...current[pending.slot],
            status: 'complete',
            content: finalText,
            error: null,
          },
        }))
        pendingRunRef.current = null
        setRunningSlot(null)
        pending.resolve(finalText)
        return
      }

      if (eventState === 'error' || eventState === 'aborted') {
        const errorMessage =
          (event.errorMessage as string | undefined) ||
          (eventState === 'aborted' ? 'Evaluation aborted.' : 'Evaluation failed.')
        setResults((current) => ({
          ...current,
          [pending.slot]: {
            ...current[pending.slot],
            status: 'error',
            error: errorMessage,
          },
        }))
        pendingRunRef.current = null
        setRunningSlot(null)
        pending.reject(new Error(errorMessage))
      }
    })
  }, [onEvent])

  const updatePrimaryEvaluation = useCallback(
    (next: Partial<WorkshopBlueprint['evaluation']>) => {
      onUpdatePrimaryBlueprint({
        ...primaryBlueprint,
        updatedAt: Date.now(),
        evaluation: {
          ...primaryBlueprint.evaluation,
          ...next,
        },
      })
    },
    [onUpdatePrimaryBlueprint, primaryBlueprint],
  )

  const updateChallenger = useCallback(
    (next: Partial<WorkshopBlueprint>) => {
      onUpdateChallengerBlueprint({
        ...challengerBlueprint,
        ...next,
        updatedAt: Date.now(),
        identity: {
          ...challengerBlueprint.identity,
          ...(next.identity ?? {}),
        },
        evaluation: {
          ...challengerBlueprint.evaluation,
          ...(next.evaluation ?? {}),
        },
        guardrails: {
          ...challengerBlueprint.guardrails,
          ...(next.guardrails ?? {}),
        },
      })
    },
    [challengerBlueprint, onUpdateChallengerBlueprint],
  )

  const handleScenarioChange = useCallback(
    (scenarioId: string) => {
      const scenario = PLAYGROUND_SCENARIOS.find((entry) => entry.id === scenarioId)
      updatePrimaryEvaluation({
        scenarioId,
        prompt: scenario?.prompt ?? primaryBlueprint.evaluation.prompt,
      })
    },
    [primaryBlueprint.evaluation.prompt, updatePrimaryEvaluation],
  )

  const runBlueprint = useCallback(
    async (slot: EvalSlot, blueprint: WorkshopBlueprint, prompt: string) => {
      const trimmedPrompt = prompt.trim()
      if (!trimmedPrompt) throw new Error('Add an evaluation prompt before running the workshop.')
      if (status !== 'connected') throw new Error('Connect the gateway before running an evaluation.')

      const sessionKey = buildRunSessionKey(slot)
      const idempotencyKey = `workshop-${slot}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const systemPrompt = buildWorkshopSystemPrompt(blueprint)

      setResults((current) => ({
        ...current,
        [slot]: {
          content: '',
          status: 'running',
          error: null,
          sessionKey,
        },
      }))
      setRunningSlot(slot)

      await sendRequest('chat.inject', {
        sessionKey,
        message: systemPrompt,
        label: `${blueprint.identity.name || 'Workshop Agent'} prompt`,
      })

      sendRequest('sessions.patch', {
        key: sessionKey,
        label: `Workshop: ${blueprint.identity.name || 'Agent'}`,
      }).catch(() => {})

      const responsePromise = new Promise<string>((resolve, reject) => {
        pendingRunRef.current = {
          slot,
          sessionKey,
          idempotencyKey,
          resolve,
          reject,
        }
      })

      const response = (await sendRequest('chat.send', {
        sessionKey,
        message: trimmedPrompt,
        idempotencyKey,
      })) as Record<string, unknown> | undefined

      const responseStatus = response?.status as string | undefined
      const inlineReply = String(response?.reply ?? response?.text ?? response?.content ?? '')

      if (
        responseStatus === 'started' ||
        responseStatus === 'in_flight' ||
        responseStatus === 'streaming'
      ) {
        return responsePromise
      }

      if (inlineReply && !/^NO_REPLY$/i.test(inlineReply.trim())) {
        pendingRunRef.current = null
        setResults((current) => ({
          ...current,
          [slot]: {
            ...current[slot],
            content: inlineReply,
            status: 'complete',
            error: null,
          },
        }))
        setRunningSlot(null)
        return inlineReply
      }

      pendingRunRef.current = null
      setRunningSlot(null)
      throw new Error('No reply received from the gateway.')
    },
    [sendRequest, status],
  )

  const resetResults = useCallback(
    (includeChallenger: boolean) => {
      setCopiedSlot(null)
      setResults({
        primary: EMPTY_RESULT,
        challenger: includeChallenger ? EMPTY_RESULT : { ...EMPTY_RESULT },
      })
    },
    [],
  )

  const handleRunPrimary = useCallback(async () => {
    resetResults(false)
    try {
      await runBlueprint('primary', primaryBlueprint, primaryBlueprint.evaluation.prompt)
    } catch (error) {
      setResults((current) => ({
        ...current,
        primary: {
          ...current.primary,
          status: 'error',
          error: error instanceof Error ? error.message : 'Evaluation failed.',
        },
      }))
    }
  }, [primaryBlueprint, resetResults, runBlueprint])

  const handleRunCompare = useCallback(async () => {
    resetResults(true)
    try {
      await runBlueprint('primary', primaryBlueprint, primaryBlueprint.evaluation.prompt)
    } catch (error) {
      setResults((current) => ({
        ...current,
        primary: {
          ...current.primary,
          status: 'error',
          error: error instanceof Error ? error.message : 'Comparison failed.',
        },
      }))
      return
    }

    try {
      await runBlueprint('challenger', challengerBlueprint, primaryBlueprint.evaluation.prompt)
    } catch (error) {
      setResults((current) => ({
        ...current,
        challenger: {
          ...current.challenger,
          status: 'error',
          error: error instanceof Error ? error.message : 'Comparison failed.',
        },
      }))
    }
  }, [challengerBlueprint, primaryBlueprint, resetResults, runBlueprint])

  const handleCopy = useCallback(async (slot: EvalSlot) => {
    const content = resultsRef.current[slot].content
    if (!content) return
    const copied = await copyToClipboard(content)
    if (!copied) return
    setCopiedSlot(slot)
    window.setTimeout(() => {
      setCopiedSlot((current) => (current === slot ? null : current))
    }, 1500)
  }, [])

  const selectedScenario = useMemo(
    () => PLAYGROUND_SCENARIOS.find((scenario) => scenario.id === primaryBlueprint.evaluation.scenarioId),
    [primaryBlueprint.evaluation.scenarioId],
  )

  const busy = runningSlot !== null
  const gatewayReady = status === 'connected'

  return (
    <section className="min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
            <Icon icon="lucide:flask-conical" width={14} height={14} />
            Evaluation Lab
          </div>
          <h2 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
            Run the blueprint before the work gets real.
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            Validate the system prompt, compare variants, and watch how guardrails change the response under the same scenario.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">Gateway</div>
          <div className="mt-1 flex items-center gap-2 text-sm font-medium">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                gatewayReady ? 'bg-[var(--color-additions,#22c55e)]' : 'bg-[var(--brand)]'
              }`}
            />
            <span className="text-[var(--text-primary)] capitalize">{status}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            {gatewayReady
              ? 'Ready to inject the workshop prompt and stream the response.'
              : 'Connect the gateway to unlock live simulation.'}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="grid min-w-0 gap-6">
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg)] p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Scenario</h3>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Start from a curated challenge, then tune it to reflect your real use case.
              </p>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                Scenario
              </span>
              <select
                value={primaryBlueprint.evaluation.scenarioId}
                onChange={(event) => handleScenarioChange(event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
              >
                {PLAYGROUND_SCENARIOS.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.title}
                  </option>
                ))}
              </select>
            </label>

            {selectedScenario?.description && (
              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                  Brief
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{selectedScenario.description}</p>
              </div>
            )}

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                Evaluation Prompt
              </span>
              <textarea
                value={primaryBlueprint.evaluation.prompt}
                onChange={(event) => updatePrimaryEvaluation({ prompt: event.target.value })}
                rows={9}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
              />
            </label>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleRunPrimary}
                disabled={busy || !gatewayReady || !primaryBlueprint.evaluation.prompt.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-[var(--brand-contrast)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon
                  icon={busy && runningSlot === 'primary' && !compareMode ? 'lucide:loader-circle' : 'lucide:play'}
                  width={16}
                  height={16}
                  className={busy && runningSlot === 'primary' && !compareMode ? 'animate-spin' : ''}
                />
                Run Preview
              </button>
              <button
                type="button"
                onClick={handleRunCompare}
                disabled={busy || !compareMode || !gatewayReady || !primaryBlueprint.evaluation.prompt.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon
                  icon={busy && compareMode ? 'lucide:loader-circle' : 'lucide:git-compare'}
                  width={16}
                  height={16}
                  className={busy && compareMode ? 'animate-spin' : ''}
                />
                Compare Variants
              </button>
            </div>
          </section>

          {compareMode && (
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg)] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Challenger Variant</h3>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    Create a counterfactual blueprint and test it against the same prompt.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClonePrimaryToChallenger}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--brand)] hover:text-[var(--text-primary)]"
                >
                  <Icon icon="lucide:copy-plus" width={14} height={14} />
                  Mirror Primary
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                    Name
                  </span>
                  <input
                    type="text"
                    value={challengerBlueprint.identity.name}
                    onChange={(event) =>
                      updateChallenger({
                        identity: {
                          ...challengerBlueprint.identity,
                          name: event.target.value,
                        },
                      })
                    }
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                    Persona
                  </span>
                  <select
                    value={challengerBlueprint.identity.personaId}
                    onChange={(event) =>
                      updateChallenger({
                        identity: {
                          ...challengerBlueprint.identity,
                          personaId: event.target.value,
                        },
                      })
                    }
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                  >
                    {PERSONA_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                  Custom Prompt Delta
                </span>
                <textarea
                  value={challengerBlueprint.identity.customPrompt}
                  onChange={(event) =>
                    updateChallenger({
                      identity: {
                        ...challengerBlueprint.identity,
                        customPrompt: event.target.value,
                      },
                    })
                  }
                  rows={5}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                  placeholder="Optionally override the persona prompt for the challenger."
                />
              </label>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                    Skill Loadout
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {challengerBlueprint.skillIds.length} selected
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SKILLS_CATALOG.map((skill) => {
                    const active = challengerBlueprint.skillIds.includes(skill.id)
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() =>
                          updateChallenger({
                            skillIds: active
                              ? challengerBlueprint.skillIds.filter((id) => id !== skill.id)
                              : [...challengerBlueprint.skillIds, skill.id],
                          })
                        }
                        className={`rounded-2xl border px-3 py-3 text-left transition ${
                          active
                            ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                            : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--brand)]/60'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon
                            icon={active ? 'lucide:check-circle-2' : getSkillDisplayIcon(skill)}
                            width={16}
                            height={16}
                            className={active ? 'text-[var(--brand)]' : 'text-[var(--text-tertiary)]'}
                          />
                          <div>
                            <div className="text-sm font-medium text-[var(--text-primary)]">{skill.title}</div>
                            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                              {skill.shortDescription}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="grid min-w-0 gap-6">
          <ResultPanel
            title={`${primaryBlueprint.identity.name || 'Primary'} Result`}
            state={results.primary}
            onCopy={() => handleCopy('primary')}
            copied={copiedSlot === 'primary'}
          />
          <ResultPanel
            title={`${challengerBlueprint.identity.name || 'Challenger'} Result`}
            state={results.challenger}
            onCopy={() => handleCopy('challenger')}
            copied={copiedSlot === 'challenger'}
            isVisible={compareMode}
          />
        </div>
      </div>
    </section>
  )
}
