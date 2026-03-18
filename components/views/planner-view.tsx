'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { PlanView, type PlanStep } from '@/components/plan-view'
import { useThread } from '@/context/thread-context'
import { useView } from '@/context/view-context'
import { emit, on } from '@/lib/events'
import type { ChatMessage } from '@/lib/chat-stream'

const AGENT_MODE_STORAGE_PREFIX = 'code-editor:agent-mode:'

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function readThreadMessages(storageKey: string): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch {
    return []
  }
}

function readAgentMode(threadId: string): 'ask' | 'agent' | 'plan' {
  if (typeof window === 'undefined') return 'ask'
  try {
    return (
      (localStorage.getItem(`${AGENT_MODE_STORAGE_PREFIX}${threadId}`) as
        | 'ask'
        | 'agent'
        | 'plan') || 'ask'
    )
  } catch {
    return 'ask'
  }
}

function formatRelative(ts: number | undefined) {
  if (!ts) return 'No plan yet'
  const diff = Date.now() - ts
  const mins = Math.max(0, Math.floor(diff / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function PlannerView() {
  const { activeThreadId, chatStorageKey } = useThread()
  const { setView } = useView()
  const storageKey = chatStorageKey(activeThreadId)
  const [messages, setMessages] = useState<ChatMessage[]>(() => readThreadMessages(storageKey))
  const [agentMode, setAgentMode] = useState<'ask' | 'agent' | 'plan'>(() =>
    readAgentMode(activeThreadId),
  )

  const refresh = useCallback(() => {
    setMessages(readThreadMessages(storageKey))
    setAgentMode(readAgentMode(activeThreadId))
  }, [activeThreadId, storageKey])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => on('threads-updated', refresh), [refresh])
  useEffect(() => on('agent-reply', refresh), [refresh])

  const plans = useMemo(
    () =>
      messages.filter(
        (msg) => msg.role === 'assistant' && msg.type === 'plan' && msg.planSteps?.length,
      ),
    [messages],
  )
  const latestPlan = plans.at(-1)
  const latestPlanIndex = latestPlan ? messages.findIndex((msg) => msg.id === latestPlan.id) : -1
  const planSteps = (latestPlan?.planSteps ?? []) as PlanStep[]
  const planMessageCount = plans.length
  const hasPlan = planSteps.length > 0
  const latestUserAfterPlan =
    latestPlanIndex >= 0
      ? [...messages.slice(latestPlanIndex + 1)].reverse().find((msg) => msg.role === 'user')
      : undefined
  const doneCount = planSteps.filter((step) => step.status === 'done').length
  const fileCount = new Set(planSteps.flatMap((step) => step.files ?? [])).size

  const openChatWithInput = useCallback(
    (text: string, mode: 'ask' | 'agent' | 'plan' = 'plan') => {
      setView('chat')
      setTimeout(() => {
        emit('agent-mode-change', { mode })
        emit('set-agent-input', { text })
        emit('focus-agent-input')
      }, 0)
    },
    [setView],
  )

  const openChatAndSend = useCallback(
    (text: string, mode: 'ask' | 'agent' | 'plan' = 'plan') => {
      setView('chat')
      setTimeout(() => {
        emit('agent-send', { text, mode })
      }, 0)
    },
    [setView],
  )

  const executePlan = useCallback(() => {
    openChatAndSend(
      'Execute the approved plan above. Proceed step by step, keep the plan updated as you go, and summarize what changed after each step.',
      'plan',
    )
  }, [openChatAndSend])

  const refinePlan = useCallback(() => {
    openChatWithInput(
      `Revise the current plan. Keep the same overall goal, but adjust the steps as follows:

`,
      'plan',
    )
  }, [openChatWithInput])

  const createPlan = useCallback(() => {
    openChatAndSend(
      'Create a structured implementation plan for this task. Return a numbered plan with **bold step titles**, clear descriptions, and affected files in backticks.',
      'plan',
    )
  }, [openChatAndSend])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 md:px-6 md:py-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--brand)_10%,var(--bg-elevated))_0%,var(--bg-elevated)_100%)] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.16)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--brand)_24%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-3 py-1 text-[11px] font-medium text-[var(--brand)]">
                <Icon icon="lucide:list-checks" width={13} height={13} />
                Planner
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)] md:text-2xl">
                  Plan before you act
                </h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  A dedicated planning surface for this thread. Build a structured implementation
                  plan, review impact, refine it, then approve execution without burying the plan
                  inside chat scrollback.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PlannerBadge
                  label={`Thread ${activeThreadId === 'main' ? 'main' : activeThreadId.replace('thread-', '#')}`}
                />
                <PlannerBadge
                  label={agentMode === 'plan' ? 'Plan mode active' : `Mode: ${agentMode}`}
                  tone={agentMode === 'plan' ? 'brand' : 'muted'}
                />
                <PlannerBadge
                  label={
                    hasPlan
                      ? `Updated ${formatRelative(latestPlan?.timestamp)}`
                      : 'Waiting for first plan'
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:min-w-[240px]">
              <button
                onClick={hasPlan ? executePlan : createPlan}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-contrast)] shadow-[0_8px_24px_color-mix(in_srgb,var(--brand)_28%,transparent)] transition hover:opacity-95"
              >
                <Icon icon={hasPlan ? 'lucide:play' : 'lucide:sparkles'} width={14} height={14} />
                {hasPlan ? 'Approve & execute plan' : 'Create first plan'}
              </button>
              <button
                onClick={refinePlan}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)]"
              >
                <Icon icon="lucide:pencil-line" width={14} height={14} />
                Refine in chat
              </button>
              <button
                onClick={() => setView('chat')}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-medium text-[var(--text-tertiary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
              >
                <Icon icon="lucide:messages-square" width={13} height={13} />
                Open chat thread
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {hasPlan ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 md:p-4">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      Current implementation plan
                    </h2>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                      The latest structured plan generated in this thread. Approvals and refinements
                      stay tied to the same conversation context.
                    </p>
                  </div>
                </div>
                <PlanView
                  steps={planSteps}
                  interactive={agentMode === 'plan'}
                  onApprove={executePlan}
                  onReject={refinePlan}
                  title="Execution plan"
                />
              </div>
            ) : (
              <EmptyPlannerState onCreatePlan={createPlan} onOpenChat={() => setView('chat')} />
            )}
          </div>

          <div className="space-y-4">
            <InfoCard
              title="Overview"
              icon="lucide:layout-list"
              rows={[
                { label: 'Plan versions', value: String(planMessageCount) },
                { label: 'Steps', value: String(planSteps.length) },
                { label: 'Files mentioned', value: String(fileCount) },
                { label: 'Completed', value: `${doneCount}/${planSteps.length || 0}` },
              ]}
            />

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Icon
                  icon="lucide:history"
                  width={14}
                  height={14}
                  className="text-[var(--text-secondary)]"
                />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Plan context</h3>
              </div>
              <div className="space-y-3 text-xs leading-5 text-[var(--text-secondary)]">
                <div>
                  <div className="mb-1 font-medium text-[var(--text-primary)]">
                    Latest plan note
                  </div>
                  <p className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                    {latestPlan?.content?.slice(0, 280) ||
                      'No plan has been drafted in this thread yet.'}
                  </p>
                </div>
                <div>
                  <div className="mb-1 font-medium text-[var(--text-primary)]">
                    Latest user follow-up
                  </div>
                  <p className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                    {latestUserAfterPlan?.content?.slice(0, 220) ||
                      'No follow-up after the current plan yet.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Icon
                  icon="lucide:wand-sparkles"
                  width={14}
                  height={14}
                  className="text-[var(--text-secondary)]"
                />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Suggested next actions
                </h3>
              </div>
              <div className="space-y-2">
                <ActionChip
                  label="Ask for risks and rollback"
                  onClick={() =>
                    openChatWithInput(
                      'Review the current plan for risks, missing edge cases, and rollback strategy. Return an updated numbered plan.',
                      'plan',
                    )
                  }
                />
                <ActionChip
                  label="Break steps into smaller chunks"
                  onClick={() =>
                    openChatWithInput(
                      'Refine the current plan into smaller, reviewable steps with explicit affected files and checkpoints.',
                      'plan',
                    )
                  }
                />
                <ActionChip
                  label="Generate test strategy"
                  onClick={() =>
                    openChatWithInput(
                      'Add a testing and verification strategy to the current plan before execution.',
                      'plan',
                    )
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlannerBadge({
  label,
  tone = 'default',
}: {
  label: string
  tone?: 'default' | 'brand' | 'muted'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
        tone === 'brand' &&
          'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]',
        tone === 'muted' &&
          'bg-[var(--bg)] text-[var(--text-secondary)] border border-[var(--border)]',
        tone === 'default' &&
          'bg-[var(--bg)] text-[var(--text-tertiary)] border border-[var(--border)]',
      )}
    >
      {label}
    </span>
  )
}

function InfoCard({
  title,
  icon,
  rows,
}: {
  title: string
  icon: string
  rows: Array<{ label: string; value: string }>
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon icon={icon} width={14} height={14} className="text-[var(--text-secondary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-xl bg-[var(--bg)] px-3 py-2"
          >
            <span className="text-xs text-[var(--text-tertiary)]">{row.label}</span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)]"
    >
      <span>{label}</span>
      <Icon
        icon="lucide:arrow-up-right"
        width={12}
        height={12}
        className="text-[var(--text-tertiary)]"
      />
    </button>
  )
}

function EmptyPlannerState({
  onCreatePlan,
  onOpenChat,
}: {
  onCreatePlan: () => void
  onOpenChat: () => void
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--brand)]">
        <Icon icon="lucide:list-todo" width={26} height={26} />
      </div>
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        No plan in this thread yet
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
        Switch the agent into plan mode, ask it to outline the work, and the structured plan will
        live here instead of getting lost in chat history.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onCreatePlan}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-contrast)]"
        >
          <Icon icon="lucide:sparkles" width={14} height={14} />
          Start planning
        </button>
        <button
          onClick={onOpenChat}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]"
        >
          <Icon icon="lucide:messages-square" width={14} height={14} />
          Open chat
        </button>
      </div>
    </div>
  )
}
