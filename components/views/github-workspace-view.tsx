'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useWorkspaceSettings } from '@/context/workspace-settings-context'
import { useView } from '@/context/view-context'
import { loadGithubWorkspace, type GithubWorkspaceItem } from '@/lib/github-workspace'

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

function DetailEmpty() {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center rounded-[28px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-8 text-center">
      <div className="max-w-sm space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--brand)]">
          <Icon icon="lucide:github" width={22} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Pick an item</h3>
          <p className="mt-1 text-[12px] leading-6 text-[var(--text-secondary)]">
            Compact cards on the left, focused details on the right — tuned for desktop review and
            stacked cleanly on iPhone.
          </p>
        </div>
      </div>
    </div>
  )
}

export function GithubWorkspaceView() {
  const { settings, effectiveRepo, effectiveBrain } = useWorkspaceSettings()
  const { setView } = useView()
  const [items, setItems] = useState<GithubWorkspaceItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sourceMessage, setSourceMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await loadGithubWorkspace(effectiveRepo, settings.filters)
    setItems(result.items)
    setSourceMessage(result.message ?? null)
    setSelectedId((current) => current ?? result.items[0]?.id ?? null)
    setLoading(false)
  }, [effectiveRepo, settings.filters])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  )

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
              Review open work with global repo, brain, and people filters shared across the shell.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)]"
          >
            <Icon icon="lucide:refresh-cw" width={14} />
            Refresh
          </button>
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
          {[...settings.filters.labels, ...settings.filters.authors, ...settings.filters.assignees]
            .length > 0 && (
            <span className="rounded-full border border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] px-3 py-1.5 text-[var(--text-primary)]">
              Filters active
            </span>
          )}
        </div>
      </div>

      {sourceMessage && (
        <div className="border-b border-[color-mix(in_srgb,var(--brand)_18%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_7%,transparent)] px-4 py-3 text-[12px] text-[var(--text-secondary)] md:px-6 lg:px-8">
          {sourceMessage}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="w-full shrink-0 border-b border-[var(--border)] lg:w-[380px] lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-2 gap-2 border-b border-[var(--border)] px-4 py-3 md:px-6 lg:grid-cols-1 lg:px-5">
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

          <div className="max-h-[42vh] overflow-y-auto lg:max-h-none lg:h-full lg:min-h-0 lg:pb-4">
            <div className="space-y-2 p-3 md:p-4 lg:p-3">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="animate-pulse rounded-[24px] border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
                  >
                    <div className="h-3 w-16 rounded bg-white/10" />
                    <div className="mt-3 h-4 w-3/4 rounded bg-white/10" />
                    <div className="mt-2 h-3 w-full rounded bg-white/5" />
                    <div className="mt-1.5 h-3 w-2/3 rounded bg-white/5" />
                  </div>
                ))
              ) : items.length > 0 ? (
                items.map((item) => {
                  const active = item.id === selected?.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-[24px] border p-4 text-left transition ${
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
                        <span className="text-[11px] text-[var(--text-disabled)]">
                          {formatRelative(item.updatedAt)}
                        </span>
                      </div>
                      <div className="mt-3 text-[14px] font-medium leading-6 text-[var(--text-primary)]">
                        {item.title}
                      </div>
                      <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                        {item.body || 'No description yet.'}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.labels.slice(0, 3).map((label) => (
                          <span
                            key={label.name}
                            className="rounded-full border px-2 py-1 text-[10px] font-medium"
                            style={labelClasses(label.color)}
                          >
                            {label.name}
                          </span>
                        ))}
                      </div>
                    </button>
                  )
                })
              ) : (
                <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-5 text-center text-[12px] text-[var(--text-secondary)]">
                  Nothing matched the active filters.
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4 lg:p-5">
          {selected ? (
            <div className="rounded-[28px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-5 md:p-6 lg:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  <Icon
                    icon={selected.type === 'pr' ? 'lucide:git-pull-request' : 'lucide:circle-dot'}
                    width={13}
                  />
                  {selected.type === 'pr' ? 'Pull request' : 'Issue'} #{selected.number}
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

              <h2 className="mt-4 text-[24px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                {selected.title}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.labels.map((label) => (
                  <span
                    key={label.name}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
                    style={labelClasses(label.color)}
                  >
                    {label.name}
                  </span>
                ))}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                <div className="mt-4 grid gap-3 md:grid-cols-3">
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

              <div className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--bg)] p-4 md:p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                  Summary
                </div>
                <p className="mt-3 whitespace-pre-wrap text-[13px] leading-7 text-[var(--text-secondary)]">
                  {selected.body || 'No body provided yet.'}
                </p>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--brand)]"
                >
                  <Icon icon="lucide:arrow-up-right" width={14} />
                  Open on GitHub
                </a>
                <button
                  type="button"
                  onClick={() => setView('settings')}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 text-[12px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                >
                  <Icon icon="lucide:sliders-horizontal" width={14} />
                  Adjust filters in Settings
                </button>
              </div>
            </div>
          ) : (
            <DetailEmpty />
          )}
        </main>
      </div>
    </div>
  )
}
