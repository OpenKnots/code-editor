'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import {
  type AgentActivity,
  summarizeActivities,
  activityIcon,
  activityColor,
} from '@/lib/agent-activity'

interface Props {
  activities: AgentActivity[]
  isRunning: boolean
}

export function AgentActivityFeed({ activities, isRunning }: Props) {
  const [expanded, setExpanded] = useState(false)
  const summary = summarizeActivities(activities)

  if (activities.length === 0) return null

  const lastActivity = activities[activities.length - 1]

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] overflow-hidden my-1.5">
      {/* Compact summary bar */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-[color-mix(in_srgb,var(--text-primary)_3%,transparent)] transition-colors"
      >
        {isRunning && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand)] opacity-50" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--brand)]" />
          </span>
        )}
        {!isRunning && (
          <Icon icon="lucide:check-circle" width={12} className="text-[var(--color-additions)] shrink-0" />
        )}

        {/* Current action or summary */}
        <span className="text-[11px] text-[var(--text-secondary)] flex-1 truncate">
          {isRunning
            ? lastActivity.label
            : `${summary.totalActions} actions`}
        </span>

        {/* File change badges */}
        <div className="flex items-center gap-1.5">
          {summary.filesEdited.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-amber-400">
              <Icon icon="lucide:file-pen-line" width={10} />
              {summary.filesEdited.length}
            </span>
          )}
          {summary.filesCreated.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-green-400">
              <Icon icon="lucide:file-plus" width={10} />
              {summary.filesCreated.length}
            </span>
          )}
          {summary.filesRead.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-blue-400">
              <Icon icon="lucide:file-search" width={10} />
              {summary.filesRead.length}
            </span>
          )}
          {summary.commandsRun > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-cyan-400">
              <Icon icon="lucide:terminal" width={10} />
              {summary.commandsRun}
            </span>
          )}
        </div>

        <Icon
          icon={expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
          width={11}
          className="text-[var(--text-disabled)] shrink-0"
        />
      </button>

      {/* Expanded timeline */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-3 py-2 max-h-[240px] overflow-y-auto">
          <div className="relative flex flex-col gap-0">
            {/* Timeline line */}
            <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[color-mix(in_srgb,var(--brand)_15%,var(--border))]" />

            {activities.map((act, i) => {
              const isLast = i === activities.length - 1
              return (
                <div
                  key={act.id}
                  className="flex items-start gap-2.5 py-1 relative"
                >
                  {/* Timeline dot */}
                  <div className="relative z-[1] shrink-0 mt-0.5">
                    {isLast && isRunning ? (
                      <span className="relative flex h-[9px] w-[9px]">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand)] opacity-50" />
                        <span className="relative inline-flex rounded-full h-[9px] w-[9px] bg-[var(--brand)]" />
                      </span>
                    ) : (
                      <span className={`block w-[9px] h-[9px] rounded-full border-2 ${
                        act.status === 'error'
                          ? 'border-[var(--color-deletions)] bg-[var(--color-deletions)]'
                          : 'border-[color-mix(in_srgb,var(--brand)_40%,var(--border))] bg-[var(--bg-subtle)]'
                      }`} />
                    )}
                  </div>

                  {/* Activity content */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <Icon
                      icon={activityIcon(act.type)}
                      width={11}
                      className={`shrink-0 ${activityColor(act.type)}`}
                    />
                    <span className={`text-[10px] truncate ${
                      isLast && isRunning ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-disabled)]'
                    }`}>
                      {act.label}
                    </span>
                  </div>

                  {/* File chip */}
                  {act.file && (
                    <span className="text-[8px] font-mono text-[var(--text-disabled)] truncate max-w-[100px]">
                      {act.file.split('/').pop()}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Changed files summary */}
          {!isRunning && summary.filesEdited.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[var(--border)]">
              <p className="text-[9px] uppercase tracking-wider text-[var(--text-disabled)] font-medium mb-1">Changed Files</p>
              <div className="flex flex-wrap gap-1">
                {[...summary.filesEdited, ...summary.filesCreated].map(f => (
                  <span
                    key={f}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-[color-mix(in_srgb,var(--brand)_6%,transparent)] border border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] text-[var(--text-secondary)]"
                  >
                    <Icon icon={summary.filesCreated.includes(f) ? 'lucide:file-plus' : 'lucide:file-pen-line'} width={9} />
                    {f.split('/').pop()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
