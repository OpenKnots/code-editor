'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon } from '@iconify/react'
import { useWorkspaceSettings } from '@/context/workspace-settings-context'
import { useView } from '@/context/view-context'
import {
  addIssueComment,
  addPullRequestReviewComment,
  addPRComment,
  getGithubToken,
  setIssueAssignees,
  setIssueLabels,
  updateIssue,
  updatePullRequest,
} from '@/lib/github-api'
import { loadGithubWorkspace, type GithubWorkspaceItem } from '@/lib/github-workspace'

const STATE_OPTIONS = [
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
] as const

function formatRelative(date: string) {
  const delta = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(delta / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

function labelClasses(color?: string) {
  const safe = color ? `#${color}` : 'var(--brand)'
  return {
    backgroundColor: `color-mix(in srgb, ${safe} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${safe} 28%, var(--border))`,
    color: safe,
  }
}

function parseCommaList(value: string) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function statusTone(source: 'github' | 'demo', state: GithubWorkspaceItem['state']) {
  if (source === 'demo') return 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]'
  return state === 'open'
    ? 'border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--text-primary)]'
    : 'border-[color-mix(in_srgb,#f59e0b_24%,var(--border))] bg-[color-mix(in_srgb,#f59e0b_10%,transparent)] text-[var(--text-primary)]'
}

function EmptyState({
  title,
  body,
  cta,
  onCta,
}: {
  title: string
  body: string
  cta: string
  onCta: () => void
}) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-[28px] border border-dashed border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-8 text-center">
      <div className="max-w-md space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] border border-[var(--border)] bg-[var(--bg)] text-[var(--brand)] shadow-[0_10px_32px_rgba(0,0,0,0.16)]">
          <Icon icon="lucide:github" width={24} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{body}</p>
        </div>
        <button
          type="button"
          onClick={onCta}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--brand)]"
        >
          <Icon icon="lucide:sliders-horizontal" width={14} />
          {cta}
        </button>
      </div>
    </div>
  )
}

export function GithubWorkspaceView() {
  const {
    settings,
    effectiveRepo,
    effectiveBrain,
    repoDefaultActive,
    brainDefaultActive,
    updateFilters,
  } = useWorkspaceSettings()
  const { setView } = useView()
  const [items, setItems] = useState<GithubWorkspaceItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<'github' | 'demo'>('demo')
  const [sourceMessage, setSourceMessage] = useState<string | null>(null)
  const [mutationBusy, setMutationBusy] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [assigneeInput, setAssigneeInput] = useState('')
  const [reviewPath, setReviewPath] = useState('')
  const [reviewLine, setReviewLine] = useState('')
  const [composerMode, setComposerMode] = useState<'comment' | 'review'>('comment')
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setActionError(null)
    const result = await loadGithubWorkspace(effectiveRepo, settings.filters)
    setItems(result.items)
    setSource(result.source)
    setSourceMessage(result.message ?? null)
    setSelectedId((current) => {
      if (current && result.items.some((item) => item.id === current)) return current
      return result.items[0]?.id ?? null
    })
    setLoading(false)
  }, [effectiveRepo, settings.filters])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  )

  useEffect(() => {
    setComposerMode('comment')
    setCommentBody('')
    setLabelInput('')
    setAssigneeInput('')
    setReviewPath('')
    setReviewLine('')
    setActionFeedback(null)
    setActionError(null)
  }, [selected?.id])

  const filtersActive =
    settings.filters.state !== 'open' ||
    settings.filters.labels.length > 0 ||
    settings.filters.authors.length > 0 ||
    settings.filters.assignees.length > 0
  const canMutate = source === 'github' && !!getGithubToken() && !!effectiveRepo

  const runMutation = useCallback(
    async (action: () => Promise<void>, successMessage: string) => {
      setMutationBusy(true)
      setActionFeedback(null)
      setActionError(null)
      try {
        await action()
        setActionFeedback(successMessage)
        await load()
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'GitHub action failed.')
      } finally {
        setMutationBusy(false)
      }
    },
    [load],
  )

  const submitComment = useCallback(async () => {
    if (!selected || !commentBody.trim()) return
    if (selected.type === 'pr' && composerMode === 'review') {
      const line = Number.parseInt(reviewLine, 10)
      if (!reviewPath.trim() || !Number.isFinite(line) || line <= 0) {
        setActionError('Review comments need a file path and a positive line number.')
        return
      }
      await runMutation(async () => {
        await addPullRequestReviewComment(effectiveRepo, selected.number, {
          body: commentBody.trim(),
          path: reviewPath.trim(),
          line,
        })
        setCommentBody('')
        setReviewPath('')
        setReviewLine('')
      }, `Added review comment on ${reviewPath.trim()}:${line}.`)
      return
    }

    await runMutation(
      async () => {
        if (selected.type === 'pr') {
          await addPRComment(effectiveRepo, selected.number, commentBody.trim())
        } else {
          await addIssueComment(effectiveRepo, selected.number, commentBody.trim())
        }
        setCommentBody('')
      },
      `Posted a comment on ${selected.type === 'pr' ? 'PR' : 'issue'} #${selected.number}.`,
    )
  }, [commentBody, composerMode, effectiveRepo, reviewLine, reviewPath, runMutation, selected])

  const saveState = useCallback(
    async (nextState: 'open' | 'closed') => {
      if (!selected) return
      await runMutation(
        async () => {
          if (selected.type === 'pr') {
            await updatePullRequest(effectiveRepo, selected.number, { state: nextState })
          } else {
            await updateIssue(effectiveRepo, selected.number, { state: nextState })
          }
        },
        `${selected.type === 'pr' ? 'PR' : 'Issue'} #${selected.number} is now ${nextState}.`,
      )
    },
    [effectiveRepo, runMutation, selected],
  )

  const saveLabels = useCallback(
    async (nextLabels: string[]) => {
      if (!selected) return
      await runMutation(
        async () => {
          await setIssueLabels(effectiveRepo, selected.number, nextLabels)
        },
        `Updated labels on ${selected.type === 'pr' ? 'PR' : 'issue'} #${selected.number}.`,
      )
    },
    [effectiveRepo, runMutation, selected],
  )

  const saveAssignees = useCallback(
    async (nextAssignees: string[]) => {
      if (!selected) return
      await runMutation(
        async () => {
          await setIssueAssignees(effectiveRepo, selected.number, nextAssignees)
        },
        `Updated assignees on ${selected.type === 'pr' ? 'PR' : 'issue'} #${selected.number}.`,
      )
    },
    [effectiveRepo, runMutation, selected],
  )

  const defaultBadges = [
    repoDefaultActive ? `Repo fallback: ${effectiveRepo}` : null,
    brainDefaultActive ? `Brain fallback: ${effectiveBrain}` : null,
  ].filter(Boolean)

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--sidebar-bg)]">
      <div className="border-b border-[var(--border)] px-4 py-4 md:px-6 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--text-disabled)]">
              <span>Github workspace</span>
              <span className="h-1 w-1 rounded-full bg-[var(--brand)]" />
              <span>Linear-like review surface</span>
            </div>
            <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[var(--text-primary)] md:text-[26px]">
              PRs & Issues
            </h1>
            <p className="mt-1 max-w-2xl text-[12px] leading-6 text-[var(--text-secondary)] md:text-[13px]">
              Tighter triage cards, inline actions, and shared workspace defaults tuned for desktop
              and iPhone.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setView('settings')}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)]"
            >
              <Icon icon="lucide:sliders-horizontal" width={14} />
              Settings
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)]"
            >
              <Icon icon="lucide:refresh-cw" width={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5 text-[11px]">
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[var(--text-secondary)]">
            Repo{' '}
            <span className="ml-1 font-medium text-[var(--text-primary)]">
              {effectiveRepo || 'Not set'}
            </span>
          </span>
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[var(--text-secondary)]">
            Brain{' '}
            <span className="ml-1 font-medium text-[var(--text-primary)]">{effectiveBrain}</span>
          </span>
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[var(--text-secondary)]">
            State{' '}
            <span className="ml-1 font-medium capitalize text-[var(--text-primary)]">
              {settings.filters.state}
            </span>
          </span>
          {filtersActive && (
            <span className="rounded-full border border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] px-3 py-1.5 text-[var(--text-primary)]">
              Filters active
            </span>
          )}
          {defaultBadges.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-[color-mix(in_srgb,#38bdf8_20%,var(--border))] bg-[color-mix(in_srgb,#38bdf8_10%,transparent)] px-3 py-1.5 text-[var(--text-primary)]"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>

      {sourceMessage && (
        <div className="border-b border-[color-mix(in_srgb,var(--brand)_18%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_7%,transparent)] px-4 py-3 text-[12px] text-[var(--text-secondary)] md:px-6 lg:px-8">
          {sourceMessage}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="w-full shrink-0 border-b border-[var(--border)] lg:w-[360px] lg:border-b-0 lg:border-r xl:w-[390px]">
          <div className="grid grid-cols-2 gap-2 border-b border-[var(--border)] px-4 py-3 md:grid-cols-4 md:px-6 lg:grid-cols-2 lg:px-5">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 md:col-span-2 lg:col-span-2">
              <div className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                State
              </div>
              <div className="grid grid-cols-3 gap-1">
                {STATE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => updateFilters({ state: option.id })}
                    className={`rounded-xl px-2 py-2 text-[11px] font-medium capitalize transition ${
                      settings.filters.state === option.id
                        ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {[
              ['Labels', settings.filters.labels],
              ['Authors', settings.filters.authors],
              ['Assignees', settings.filters.assignees],
            ].map(([label, values]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                  {label}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(values as string[]).length > 0 ? (
                    (values as string[]).map((value) => (
                      <span
                        key={value}
                        className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] text-[var(--text-primary)]"
                      >
                        {value}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-[var(--text-disabled)]">Any</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="max-h-[42vh] overflow-y-auto lg:h-full lg:min-h-0 lg:max-h-none lg:pb-4">
            <div className="space-y-2 p-3 md:p-4 lg:p-3">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="animate-pulse rounded-[22px] border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5"
                  >
                    <div className="h-3 w-16 rounded bg-white/10" />
                    <div className="mt-2.5 h-4 w-5/6 rounded bg-white/10" />
                    <div className="mt-2 h-3 w-full rounded bg-white/5" />
                    <div className="mt-1.5 h-3 w-2/3 rounded bg-white/5" />
                  </div>
                ))
              ) : items.length > 0 ? (
                items.map((item) => {
                  const active = item.id === selected?.id
                  return (
                    <motion.button
                      layout
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-[22px] border px-3.5 py-3 text-left transition-all ${
                        active
                          ? 'border-[color-mix(in_srgb,var(--brand)_36%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] shadow-[0_14px_40px_rgba(0,0,0,0.18)]'
                          : 'border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                          <Icon
                            icon={
                              item.type === 'pr' ? 'lucide:git-pull-request' : 'lucide:circle-dot'
                            }
                            width={12}
                          />
                          {item.type === 'pr' ? 'PR' : 'Issue'} #{item.number}
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-medium capitalize ${statusTone(source, item.state)}`}
                        >
                          {item.state}
                        </span>
                      </div>
                      <div className="mt-2.5 text-[13px] font-semibold leading-5 text-[var(--text-primary)]">
                        {item.title}
                      </div>
                      <div className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                        {item.body || 'No description yet.'}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px] text-[var(--text-disabled)]">
                        <span>@{item.author}</span>
                        <span>{formatRelative(item.updatedAt)}</span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {item.labels.slice(0, 3).map((label) => (
                          <span
                            key={label.name}
                            className="rounded-full border px-2 py-1 text-[10px] font-medium"
                            style={labelClasses(label.color)}
                          >
                            {label.name}
                          </span>
                        ))}
                        {item.labels.length > 3 && (
                          <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-secondary)]">
                            +{item.labels.length - 3}
                          </span>
                        )}
                      </div>
                    </motion.button>
                  )
                })
              ) : (
                <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-5 text-center">
                  <div className="text-[13px] font-medium text-[var(--text-primary)]">
                    No work matched
                  </div>
                  <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                    Try widening the state filter or clearing a person / label filter in Settings.
                  </p>
                  <button
                    type="button"
                    onClick={() => setView('settings')}
                    className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-hover)]"
                  >
                    <Icon icon="lucide:sliders-horizontal" width={14} />
                    Open settings
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4 lg:p-5">
          {!effectiveRepo ? (
            <EmptyState
              title="Choose a repository first"
              body="Set a workspace repo in Settings or keep the current repo as your default source for PRs and Issues."
              cta="Open settings"
              onCta={() => setView('settings')}
            />
          ) : !selected ? (
            <EmptyState
              title="Pick an item"
              body="Compact cards on the left, focused details on the right — tuned for quick triage on desktop and thumb-friendly review on iPhone."
              cta="Adjust filters"
              onCta={() => setView('settings')}
            />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="rounded-[28px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 md:p-6 lg:p-7"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                    <Icon
                      icon={
                        selected.type === 'pr' ? 'lucide:git-pull-request' : 'lucide:circle-dot'
                      }
                      width={13}
                    />
                    {selected.type === 'pr' ? 'Pull request' : 'Issue'} #{selected.number}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium capitalize ${statusTone(source, selected.state)}`}
                  >
                    <Icon
                      icon={selected.state === 'open' ? 'lucide:circle-dot' : 'lucide:circle-off'}
                      width={13}
                    />
                    {selected.state}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)]">
                    <Icon icon="lucide:user-round" width={13} />
                    {selected.author}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)]">
                    <Icon icon="lucide:brain-circuit" width={13} />
                    {effectiveBrain}
                  </span>
                </div>

                <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.03em] text-[var(--text-primary)] md:text-[26px]">
                  {selected.title}
                </h2>

                <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {[
                        ['Updated', formatRelative(selected.updatedAt)],
                        ['Comments', String(selected.comments)],
                        [
                          'Assignees',
                          selected.assignees.length ? selected.assignees.join(', ') : 'Unassigned',
                        ],
                        ['Branch', selected.branch || '—'],
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3"
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                            {label}
                          </div>
                          <div className="mt-2 text-[13px] font-medium text-[var(--text-primary)]">
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {selected.type === 'pr' && (
                      <div className="grid gap-3 md:grid-cols-3">
                        {[
                          ['Additions', String(selected.additions ?? 0)],
                          ['Deletions', String(selected.deletions ?? 0)],
                          ['Files', String(selected.changedFiles ?? 0)],
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3"
                          >
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                              {label}
                            </div>
                            <div className="mt-2 text-[13px] font-medium text-[var(--text-primary)]">
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg)] p-4 md:p-5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                        Summary
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selected.labels.map((label) => (
                          <button
                            key={label.name}
                            type="button"
                            disabled={!canMutate || mutationBusy}
                            onClick={() =>
                              void saveLabels(
                                selected.labels
                                  .filter((entry) => entry.name !== label.name)
                                  .map((entry) => entry.name),
                              )
                            }
                            className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-80"
                            style={labelClasses(label.color)}
                            title={
                              canMutate ? `Remove ${label.name}` : 'Connect GitHub to edit labels'
                            }
                          >
                            {label.name}
                            {canMutate ? ' ×' : ''}
                          </button>
                        ))}
                        {selected.labels.length === 0 && (
                          <span className="text-[11px] text-[var(--text-disabled)]">
                            No labels yet.
                          </span>
                        )}
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-[13px] leading-7 text-[var(--text-secondary)]">
                        {selected.body || 'No body provided yet.'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <section className="rounded-[24px] border border-[var(--border)] bg-[var(--bg)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                            Inline actions
                          </div>
                          <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                            Assign, relabel, comment, and change state without leaving the
                            workspace.
                          </p>
                        </div>
                        {!canMutate && (
                          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-medium text-[var(--text-secondary)]">
                            Read-only
                          </span>
                        )}
                      </div>

                      <div className="mt-4 grid gap-3">
                        <div>
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                            State
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {selected.state === 'open' ? (
                              <button
                                type="button"
                                disabled={!canMutate || mutationBusy}
                                onClick={() => void saveState('closed')}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Icon icon="lucide:archive-x" width={14} />
                                Close
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!canMutate || mutationBusy}
                                onClick={() => void saveState('open')}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Icon icon="lucide:rotate-ccw" width={14} />
                                Reopen
                              </button>
                            )}
                            <a
                              href={selected.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--brand)]"
                            >
                              <Icon icon="lucide:arrow-up-right" width={14} />
                              Open on GitHub
                            </a>
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                            Assignees
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {selected.assignees.length > 0 ? (
                              selected.assignees.map((assignee) => (
                                <button
                                  key={assignee}
                                  type="button"
                                  disabled={!canMutate || mutationBusy}
                                  onClick={() =>
                                    void saveAssignees(
                                      selected.assignees.filter((entry) => entry !== assignee),
                                    )
                                  }
                                  className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] transition hover:border-[var(--border-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {assignee}
                                  {canMutate ? ' ×' : ''}
                                </button>
                              ))
                            ) : (
                              <span className="text-[11px] text-[var(--text-disabled)]">
                                Unassigned
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                            <input
                              type="text"
                              value={assigneeInput}
                              onChange={(event) => setAssigneeInput(event.target.value)}
                              placeholder="val, octocat"
                              className="h-11 flex-1 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                            />
                            <button
                              type="button"
                              disabled={
                                !canMutate ||
                                mutationBusy ||
                                parseCommaList(assigneeInput).length === 0
                              }
                              onClick={() =>
                                void saveAssignees(
                                  Array.from(
                                    new Set([
                                      ...selected.assignees,
                                      ...parseCommaList(assigneeInput),
                                    ]),
                                  ),
                                )
                              }
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Icon icon="lucide:user-plus" width={14} />
                              Assign
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                            Labels
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                              type="text"
                              value={labelInput}
                              onChange={(event) => setLabelInput(event.target.value)}
                              placeholder="bug, polish, ios"
                              className="h-11 flex-1 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                            />
                            <button
                              type="button"
                              disabled={
                                !canMutate ||
                                mutationBusy ||
                                parseCommaList(labelInput).length === 0
                              }
                              onClick={() =>
                                void saveLabels(
                                  Array.from(
                                    new Set([
                                      ...selected.labels.map((entry) => entry.name),
                                      ...parseCommaList(labelInput),
                                    ]),
                                  ),
                                )
                              }
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Icon icon="lucide:tag" width={14} />
                              Add labels
                            </button>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-[24px] border border-[var(--border)] bg-[var(--bg)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                            Comment
                          </div>
                          <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                            {selected.type === 'pr'
                              ? 'Add a normal comment or a lightweight single-line review comment.'
                              : 'Add issue comments inline from the triage surface.'}
                          </p>
                        </div>
                        {selected.type === 'pr' && (
                          <div className="flex rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 text-[11px]">
                            {[
                              ['comment', 'Comment'],
                              ['review', 'Review'],
                            ].map(([id, label]) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setComposerMode(id as 'comment' | 'review')}
                                className={`rounded-xl px-3 py-1.5 transition ${
                                  composerMode === id
                                    ? 'bg-[var(--bg)] text-[var(--text-primary)]'
                                    : 'text-[var(--text-secondary)]'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {selected.type === 'pr' && composerMode === 'review' && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                          <input
                            type="text"
                            value={reviewPath}
                            onChange={(event) => setReviewPath(event.target.value)}
                            placeholder="src/components/file.tsx"
                            className="h-11 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                          />
                          <input
                            type="number"
                            min={1}
                            value={reviewLine}
                            onChange={(event) => setReviewLine(event.target.value)}
                            placeholder="Line"
                            className="h-11 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                          />
                        </div>
                      )}

                      <textarea
                        value={commentBody}
                        onChange={(event) => setCommentBody(event.target.value)}
                        placeholder={
                          selected.type === 'pr' && composerMode === 'review'
                            ? 'Leave a focused note for this diff line…'
                            : 'Leave a comment…'
                        }
                        className="mt-3 min-h-[120px] w-full rounded-[22px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-3 py-3 text-[13px] text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                      />

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {mutationBusy
                            ? 'Saving to GitHub…'
                            : canMutate
                              ? 'Writes land directly on GitHub.'
                              : 'Connect GitHub to unlock inline actions.'}
                        </div>
                        <button
                          type="button"
                          disabled={!canMutate || mutationBusy || !commentBody.trim()}
                          onClick={() => void submitComment()}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Icon
                            icon={
                              selected.type === 'pr' && composerMode === 'review'
                                ? 'lucide:message-square-dot'
                                : 'lucide:message-square-plus'
                            }
                            width={14}
                          />
                          {selected.type === 'pr' && composerMode === 'review'
                            ? 'Add review comment'
                            : 'Post comment'}
                        </button>
                      </div>

                      {actionFeedback && (
                        <div className="mt-3 rounded-2xl border border-[color-mix(in_srgb,#22c55e_28%,var(--border))] bg-[color-mix(in_srgb,#22c55e_10%,transparent)] px-3 py-2 text-[12px] text-[var(--text-primary)]">
                          {actionFeedback}
                        </div>
                      )}
                      {actionError && (
                        <div className="mt-3 rounded-2xl border border-[color-mix(in_srgb,#ef4444_28%,var(--border))] bg-[color-mix(in_srgb,#ef4444_10%,transparent)] px-3 py-2 text-[12px] text-[var(--text-primary)]">
                          {actionError}
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    </div>
  )
}
