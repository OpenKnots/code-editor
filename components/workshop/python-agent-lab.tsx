'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { copyToClipboard } from '@/lib/clipboard'
import {
  buildPythonProgram,
  createDefaultPythonAgentLabState,
  getPatternDraft,
  normalizePythonAgentLabState,
  PYTHON_AGENT_LAB_STORAGE_KEY,
  PYTHON_AGENT_PATTERNS,
  resetPatternDraft,
  simulatePatternRun,
  updatePatternDraft,
  validatePatternDataset,
  type PythonAgentLabRunResult,
  type PythonAgentPatternId,
} from '@/lib/python-agent-lab'

function loadStoredState() {
  if (typeof window === 'undefined') return createDefaultPythonAgentLabState()
  try {
    const raw = localStorage.getItem(PYTHON_AGENT_LAB_STORAGE_KEY)
    return raw
      ? normalizePythonAgentLabState(JSON.parse(raw))
      : createDefaultPythonAgentLabState()
  } catch {
    return createDefaultPythonAgentLabState()
  }
}

function MetricBadge({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'good' | 'warn'
}) {
  const toneClass =
    tone === 'good'
      ? 'text-[var(--color-additions,#22c55e)]'
      : tone === 'warn'
        ? 'text-[var(--color-deletions,#ef4444)]'
        : 'text-[var(--text-secondary)]'

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-disabled)]">
        {label}
      </div>
      <div className={`mt-2 text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  )
}

export function PythonAgentLab() {
  const [state, setState] = useState(loadStoredState)
  const [lastRun, setLastRun] = useState<PythonAgentLabRunResult | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

  useEffect(() => {
    try {
      localStorage.setItem(PYTHON_AGENT_LAB_STORAGE_KEY, JSON.stringify(state))
    } catch {}
  }, [state])

  const selectedPattern = useMemo(
    () =>
      PYTHON_AGENT_PATTERNS.find((pattern) => pattern.id === state.selectedPatternId) ??
      PYTHON_AGENT_PATTERNS[0],
    [state.selectedPatternId],
  )
  const selectedDraft = useMemo(
    () => getPatternDraft(state, selectedPattern.id),
    [selectedPattern.id, state],
  )
  const datasetError = useMemo(
    () => validatePatternDataset(selectedPattern.id, selectedDraft.datasetText),
    [selectedDraft.datasetText, selectedPattern.id],
  )
  const generatedProgram = useMemo(
    () => buildPythonProgram(selectedPattern.id, selectedDraft),
    [selectedDraft, selectedPattern.id],
  )

  const setPattern = useCallback((patternId: PythonAgentPatternId) => {
    setState((current) => ({
      ...current,
      selectedPatternId: patternId,
    }))
    setLastRun(null)
  }, [])

  const patchSelectedDraft = useCallback(
    (patch: Parameters<typeof updatePatternDraft>[2]) => {
      setState((current) => updatePatternDraft(current, current.selectedPatternId, patch))
    },
    [],
  )

  const handleReset = useCallback(() => {
    setState((current) => resetPatternDraft(current, current.selectedPatternId))
    setLastRun(null)
  }, [])

  const handleRunSimulation = useCallback(() => {
    const result = simulatePatternRun(selectedPattern.id, selectedDraft)
    setLastRun(result)
  }, [selectedDraft, selectedPattern.id])

  const handleCopyProgram = useCallback(async () => {
    const copied = await copyToClipboard(generatedProgram)
    if (!copied) return
    setCopyState('copied')
    window.setTimeout(() => setCopyState('idle'), 1500)
  }, [generatedProgram])

  return (
    <section className="min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
            <Icon icon="lucide:file-code-2" width={14} height={14} />
            Python Agent Lab
          </div>
          <h2 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
            Prototype agent-training patterns without leaving.
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
            Edit labeled data, tune the training goal, simulate the pattern locally, and generate a
            Python starter program you can run or extend outside the browser.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
            Active Pattern
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Icon icon={selectedPattern.icon} width={16} height={16} />
            {selectedPattern.title}
          </div>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">{selectedPattern.trainingGoal}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {PYTHON_AGENT_PATTERNS.map((pattern) => {
          const active = pattern.id === selectedPattern.id
          return (
            <button
              key={pattern.id}
              type="button"
              onClick={() => setPattern(pattern.id)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                active
                  ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                  : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                    active
                      ? 'bg-[color-mix(in_srgb,var(--brand)_16%,transparent)] text-[var(--brand)]'
                      : 'bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Icon icon={active ? 'lucide:check-circle-2' : pattern.icon} width={18} height={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{pattern.title}</div>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                    {pattern.description}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="grid gap-6">
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg)] p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Training Inputs</h3>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Expected schema: {selectedPattern.datasetHint}
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--brand)] hover:text-[var(--text-primary)]"
              >
                <Icon icon="lucide:rotate-ccw" width={14} height={14} />
                Load Example
              </button>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                Training Goal
              </span>
              <textarea
                value={selectedDraft.instruction}
                onChange={(event) => patchSelectedDraft({ instruction: event.target.value })}
                rows={4}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                Dataset
              </span>
              <textarea
                value={selectedDraft.datasetText}
                onChange={(event) => patchSelectedDraft({ datasetText: event.target.value })}
                rows={16}
                spellCheck={false}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                Notes
              </span>
              <textarea
                value={selectedDraft.notes}
                onChange={(event) => patchSelectedDraft({ notes: event.target.value })}
                rows={3}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                placeholder="Optional: capture acceptance rules, deployment context, or follow-up experiments."
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedPattern.expectedFields.map((field) => (
                <span
                  key={field}
                  className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)]"
                >
                  {field}
                </span>
              ))}
            </div>

            {datasetError ? (
              <div className="mt-4 rounded-2xl border border-[color-mix(in_srgb,var(--color-deletions,#ef4444)_40%,var(--border))] bg-[color-mix(in_srgb,var(--color-deletions,#ef4444)_8%,transparent)] px-4 py-3 text-sm text-[var(--text-primary)]">
                <div className="flex items-start gap-2">
                  <Icon
                    icon="lucide:triangle-alert"
                    width={16}
                    height={16}
                    className="mt-0.5 text-[var(--color-deletions,#ef4444)]"
                  />
                  <span>{datasetError}</span>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleRunSimulation}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-[var(--brand-contrast)] transition hover:opacity-95"
              >
                <Icon icon="lucide:play" width={16} height={16} />
                Simulate Pattern
              </button>
              <button
                type="button"
                onClick={handleCopyProgram}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--brand)]"
              >
                <Icon icon={copyState === 'copied' ? 'lucide:check' : 'lucide:copy'} width={16} height={16} />
                {copyState === 'copied' ? 'Copied Python' : 'Copy Python'}
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg)] p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Simulation Output</h3>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Run the lab to estimate dataset quality before you invest in a heavier training loop.
              </p>
            </div>

            {lastRun ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{lastRun.headline}</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{lastRun.summary}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {lastRun.metrics.map((metric) => (
                    <MetricBadge
                      key={metric.label}
                      label={metric.label}
                      value={metric.value}
                      tone={metric.tone}
                    />
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                      Findings
                    </div>
                    <div className="mt-3 space-y-2">
                      {lastRun.findings.length > 0 ? (
                        lastRun.findings.map((finding) => (
                          <div key={finding} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                            <Icon
                              icon="lucide:arrow-right"
                              width={14}
                              height={14}
                              className="mt-1 shrink-0 text-[var(--text-disabled)]"
                            />
                            <span>{finding}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-[var(--text-secondary)]">
                          The starter data looks healthy enough for an initial experiment.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                      Preview Rows
                    </div>
                    <div className="mt-3 space-y-2">
                      {lastRun.preview.length > 0 ? (
                        lastRun.preview.map((row) => (
                          <div
                            key={row}
                            className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-secondary)]"
                          >
                            {row}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-[var(--text-secondary)]">
                          Add more valid rows to see a preview here.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-6 text-center text-sm text-[var(--text-tertiary)]">
                Pick a pattern, edit the dataset, and run a local simulation to see quality signals.
              </div>
            )}
          </section>
        </div>

        <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg)] p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Generated Python Program</h3>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Standard-library starter code that mirrors the current prompt and dataset.
              </p>
            </div>
            <div className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Python
            </div>
          </div>

          <pre className="max-h-[960px] min-w-0 overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-xs leading-6 text-[var(--text-secondary)] whitespace-pre-wrap break-words">
            {generatedProgram}
          </pre>
        </section>
      </div>
    </section>
  )
}
