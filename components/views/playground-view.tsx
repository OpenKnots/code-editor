'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { MarkdownPreview } from '@/components/markdown-preview'
import { useGateway } from '@/context/gateway-context'
import { PERSONA_PRESETS } from '@/lib/agent-personas'
import { copyToClipboard } from '@/lib/clipboard'
import { PLAYGROUND_SESSION_KEY } from '@/lib/playground/constants'
import { getSkillDisplayIcon } from '@/lib/skills/catalog'
import {
  PLAYGROUND_SCENARIOS,
  getPlaygroundScenarioById,
  getPlaygroundSkills,
} from '@/lib/playground/data'
import { buildPlaygroundSystemPrompt } from '@/lib/playground/prompt'

type AgentSlot = 'a' | 'b'
type ResultStatus = 'idle' | 'running' | 'complete' | 'error'

interface PlaygroundAgentConfig {
  name: string
  personaId: string
  skillIds: string[]
  customPrompt: string
}

interface AgentResultState {
  content: string
  status: ResultStatus
  error: string | null
  sessionKey: string | null
}

interface PendingRun {
  agent: AgentSlot
  sessionKey: string
  idempotencyKey: string
  resolve: (value: string) => void
  reject: (error: Error) => void
}

const DEFAULT_AGENT_A: PlaygroundAgentConfig = {
  name: 'Planner Prime',
  personaId: 'fullstack',
  skillIds: ['writing-plans', 'brainstorming'],
  customPrompt: '',
}

const DEFAULT_AGENT_B: PlaygroundAgentConfig = {
  name: 'Bug Hunter',
  personaId: 'security',
  skillIds: ['systematic-debugging', 'test-driven-development'],
  customPrompt: '',
}

const EMPTY_RESULT: AgentResultState = {
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

function buildRunSessionKey(agent: AgentSlot): string {
  return `${PLAYGROUND_SESSION_KEY}:${agent}:${Date.now()}`
}

function ResultPanel({
  title,
  state,
  isVisible,
  onCopy,
  copied,
}: {
  title: string
  state: AgentResultState
  isVisible: boolean
  onCopy: () => void
  copied: boolean
}) {
  if (!isVisible) return null

  const statusTone =
    state.status === 'error'
      ? 'text-[var(--color-deletions,#ef4444)]'
      : state.status === 'running'
        ? 'text-[var(--brand)]'
        : 'text-[var(--text-secondary)]'

  return (
    <section className="min-h-[320px] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className={`mt-1 text-xs ${statusTone}`}>
            {state.status === 'idle' && 'Ready to run'}
            {state.status === 'running' && 'Streaming response...'}
            {state.status === 'complete' && 'Run complete'}
            {state.status === 'error' && (state.error || 'Run failed')}
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          disabled={!state.content}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--brand)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} width={14} height={14} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {state.content ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <MarkdownPreview content={state.content} />
        </div>
      ) : (
        <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-6 text-center text-sm text-[var(--text-tertiary)]">
          Run the scenario to see this agent&apos;s output here.
        </div>
      )}
    </section>
  )
}

function AgentLoadoutCard({
  title,
  config,
  availableSkills,
  onChange,
}: {
  title: string
  config: PlaygroundAgentConfig
  availableSkills: ReturnType<typeof getPlaygroundSkills>
  onChange: (next: PlaygroundAgentConfig) => void
}) {
  const selectedPersona = PERSONA_PRESETS.find((preset) => preset.id === config.personaId)

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-lg">
          {selectedPersona?.emoji ?? '\u{2728}'}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="text-xs text-[var(--text-tertiary)]">
            Pick a persona and equip a few skills for this agent.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
            Agent Name
          </span>
          <input
            type="text"
            value={config.name}
            onChange={(event) => onChange({ ...config, name: event.target.value })}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
            placeholder="World-class planner"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
            Persona
          </span>
          <select
            value={config.personaId}
            onChange={(event) => onChange({ ...config, personaId: event.target.value })}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
          >
            {PERSONA_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          {selectedPersona?.description && (
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">{selectedPersona.description}</p>
          )}
        </label>

        {config.personaId === 'custom' && (
          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
              Custom System Prompt
            </span>
            <textarea
              value={config.customPrompt}
              onChange={(event) => onChange({ ...config, customPrompt: event.target.value })}
              rows={6}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
              placeholder="Describe the specialist you want to create."
            />
          </label>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
              Equipped Skills
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">{config.skillIds.length} selected</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {availableSkills.map((skill) => {
              const active = config.skillIds.includes(skill.id)
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...config,
                      skillIds: active
                        ? config.skillIds.filter((id) => id !== skill.id)
                        : [...config.skillIds, skill.id],
                    })
                  }
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                      : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/50'
                  }`}
                  aria-pressed={active}
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
      </div>
    </section>
  )
}

export function PlaygroundView() {
  const { status, sendRequest, onEvent } = useGateway()
  const availableSkills = useMemo(() => getPlaygroundSkills(), [])
  const [agentA, setAgentA] = useState<PlaygroundAgentConfig>(DEFAULT_AGENT_A)
  const [agentB, setAgentB] = useState<PlaygroundAgentConfig>(DEFAULT_AGENT_B)
  const [selectedScenarioId, setSelectedScenarioId] = useState(PLAYGROUND_SCENARIOS[0]?.id ?? '')
  const [scenarioPrompt, setScenarioPrompt] = useState(PLAYGROUND_SCENARIOS[0]?.prompt ?? '')
  const [results, setResults] = useState<Record<AgentSlot, AgentResultState>>({
    a: EMPTY_RESULT,
    b: EMPTY_RESULT,
  })
  const [runningAgent, setRunningAgent] = useState<AgentSlot | null>(null)
  const [runMode, setRunMode] = useState<'demo' | 'battle' | null>(null)
  const [copiedSlot, setCopiedSlot] = useState<AgentSlot | null>(null)
  const resultsRef = useRef(results)
  const pendingRunRef = useRef<PendingRun | null>(null)

  useEffect(() => {
    resultsRef.current = results
  }, [results])

  const selectedScenario = useMemo(
    () => getPlaygroundScenarioById(selectedScenarioId) ?? PLAYGROUND_SCENARIOS[0],
    [selectedScenarioId],
  )

  useEffect(() => {
    if (selectedScenario?.prompt) {
      setScenarioPrompt(selectedScenario.prompt)
    }
  }, [selectedScenarioId, selectedScenario])

  const updateResult = useCallback(
    (agent: AgentSlot, updater: (current: AgentResultState) => AgentResultState) => {
      setResults((current) => {
        const next = {
          ...current,
          [agent]: updater(current[agent]),
        }
        resultsRef.current = next
        return next
      })
    },
    [],
  )

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

      const matches =
        eventIdempotencyKey === pending.idempotencyKey || eventSessionKey === pending.sessionKey

      if (!matches) return

      if (eventState === 'delta') {
        const chunk = extractChatText(event)
        if (!chunk) return
        updateResult(pending.agent, (current) => ({
          ...current,
          status: 'running',
          content: appendStreamChunk(current.content, chunk),
        }))
        return
      }

      if (eventState === 'final') {
        const finalText = extractChatText(event) || resultsRef.current[pending.agent].content
        updateResult(pending.agent, (current) => ({
          ...current,
          content: finalText,
          status: 'complete',
          error: null,
        }))
        setRunningAgent(null)
        pendingRunRef.current = null
        pending.resolve(finalText)
        return
      }

      if (eventState === 'error' || eventState === 'aborted') {
        const errorMessage =
          (event.errorMessage as string | undefined) ||
          (eventState === 'aborted' ? 'Run aborted.' : 'Playground run failed.')
        updateResult(pending.agent, (current) => ({
          ...current,
          status: 'error',
          error: errorMessage,
        }))
        setRunningAgent(null)
        pendingRunRef.current = null
        pending.reject(new Error(errorMessage))
      }
    })
  }, [onEvent, updateResult])

  const handleCopy = useCallback(async (slot: AgentSlot) => {
    const content = resultsRef.current[slot].content
    if (!content) return
    const copied = await copyToClipboard(content)
    if (!copied) return
    setCopiedSlot(slot)
    window.setTimeout(() => {
      setCopiedSlot((current) => (current === slot ? null : current))
    }, 1500)
  }, [])

  const runAgent = useCallback(
    async (agent: AgentSlot, config: PlaygroundAgentConfig, prompt: string) => {
      const trimmedPrompt = prompt.trim()
      if (!trimmedPrompt) {
        throw new Error('Add a scenario prompt before running the playground.')
      }
      if (status !== 'connected') {
        throw new Error('Connect the gateway before running a demo.')
      }

      const sessionKey = buildRunSessionKey(agent)
      const idempotencyKey = `playground-${agent}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const systemPrompt = buildPlaygroundSystemPrompt({
        personaId: config.personaId,
        skillIds: config.skillIds,
        customPrompt: config.customPrompt,
      })

      updateResult(agent, () => ({
        content: '',
        status: 'running',
        error: null,
        sessionKey,
      }))
      setRunningAgent(agent)

      await sendRequest('chat.inject', {
        sessionKey,
        message: systemPrompt,
        label: `${config.name || `Agent ${agent.toUpperCase()}`} playground prompt`,
      })

      sendRequest('sessions.patch', {
        key: sessionKey,
        label: `Playground: ${config.name || `Agent ${agent.toUpperCase()}`}`,
      }).catch(() => {})

      const responsePromise = new Promise<string>((resolve, reject) => {
        pendingRunRef.current = {
          agent,
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
        updateResult(agent, (current) => ({
          ...current,
          content: inlineReply,
          status: 'complete',
          error: null,
        }))
        setRunningAgent(null)
        return inlineReply
      }

      pendingRunRef.current = null
      updateResult(agent, (current) => ({
        ...current,
        status: 'error',
        error: 'No reply received from the gateway.',
      }))
      setRunningAgent(null)
      throw new Error('No reply received from the gateway.')
    },
    [sendRequest, status, updateResult],
  )

  const resetResults = useCallback((mode: 'demo' | 'battle') => {
    setRunMode(mode)
    setCopiedSlot(null)
    setResults({
      a: EMPTY_RESULT,
      b: mode === 'battle' ? EMPTY_RESULT : { ...EMPTY_RESULT, content: '', status: 'idle' },
    })
  }, [])

  const handleRunDemo = useCallback(async () => {
    resetResults('demo')
    try {
      await runAgent('a', agentA, scenarioPrompt)
    } catch (error) {
      updateResult('a', (current) => ({
        ...current,
        status: 'error',
        error: error instanceof Error ? error.message : 'Demo run failed.',
      }))
    }
  }, [agentA, resetResults, runAgent, scenarioPrompt, updateResult])

  const handleBattleTest = useCallback(async () => {
    resetResults('battle')
    try {
      await runAgent('a', agentA, scenarioPrompt)
    } catch (error) {
      updateResult('a', (current) => ({
        ...current,
        status: 'error',
        error: error instanceof Error ? error.message : 'Battle test failed.',
      }))
      return
    }

    try {
      await runAgent('b', agentB, scenarioPrompt)
    } catch (error) {
      updateResult('b', (current) => ({
        ...current,
        status: 'error',
        error: error instanceof Error ? error.message : 'Battle test failed.',
      }))
    }
  }, [agentA, agentB, resetResults, runAgent, scenarioPrompt, updateResult])

  const busy = runningAgent !== null
  const gatewayReady = status === 'connected'

  return (
    <div className="h-full overflow-y-auto bg-[var(--sidebar-bg)]">
      <div className="flex w-full flex-col gap-6 px-4 py-6 lg:px-6">
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow-sm)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                <Icon icon="lucide:flask-conical" width={14} height={14} />
                Skill Demo & Agent Battle Test
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                Workload Playground
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Build a small team of specialist agents, equip them with skills, and run curated
                prompts to compare how they reason, plan, and debug.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                Gateway
              </div>
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
                  ? 'Ready to inject persona + skill prompts and run scenarios.'
                  : 'Connect the gateway to enable demo and battle-test runs.'}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <div className="grid gap-6">
            <AgentLoadoutCard
              title="Agent A"
              config={agentA}
              availableSkills={availableSkills}
              onChange={setAgentA}
            />
            <AgentLoadoutCard
              title="Agent B"
              config={agentB}
              availableSkills={availableSkills}
              onChange={setAgentB}
            />
          </div>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Scenario</h2>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Start from a curated prompt, then customize it before you run the agents.
              </p>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                Example Scenario
              </span>
              <select
                value={selectedScenarioId}
                onChange={(event) => setSelectedScenarioId(event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
              >
                {PLAYGROUND_SCENARIOS.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.title}
                  </option>
                ))}
              </select>
            </label>

            {selectedScenario?.description && (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                  Scenario Brief
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {selectedScenario.description}
                </p>
              </div>
            )}

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                Prompt
              </span>
              <textarea
                value={scenarioPrompt}
                onChange={(event) => setScenarioPrompt(event.target.value)}
                rows={10}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
              />
            </label>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleRunDemo}
                disabled={busy || !gatewayReady || !scenarioPrompt.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-[var(--brand-contrast)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon icon={busy && runMode === 'demo' ? 'lucide:loader-circle' : 'lucide:play'} width={16} height={16} className={busy && runMode === 'demo' ? 'animate-spin' : ''} />
                Run Demo
              </button>
              <button
                type="button"
                onClick={handleBattleTest}
                disabled={busy || !gatewayReady || !scenarioPrompt.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon
                  icon={busy && runMode === 'battle' ? 'lucide:loader-circle' : 'lucide:swords'}
                  width={16}
                  height={16}
                  className={busy && runMode === 'battle' ? 'animate-spin' : ''}
                />
                Battle Test
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-xs text-[var(--text-tertiary)]">
              Demo runs Agent A only. Battle test runs Agent A first, then Agent B on the same
              prompt so you can compare the outputs side by side.
            </div>
          </section>
        </div>

        <div className={`grid gap-6 ${runMode === 'battle' ? 'xl:grid-cols-2' : ''}`}>
          <ResultPanel
            title={`${agentA.name || 'Agent A'} Result`}
            state={results.a}
            isVisible={true}
            onCopy={() => handleCopy('a')}
            copied={copiedSlot === 'a'}
          />
          <ResultPanel
            title={`${agentB.name || 'Agent B'} Result`}
            state={results.b}
            isVisible={runMode === 'battle'}
            onCopy={() => handleCopy('b')}
            copied={copiedSlot === 'b'}
          />
        </div>
      </div>
    </div>
  )
}
