'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useWorkflow, type Workflow, type RunStatus } from '@/context/workflow-context'

const STATUS_MAP: Record<RunStatus, { icon: string; color: string; label: string; bg: string }> = {
  idle: { icon: 'lucide:circle', color: 'text-[var(--text-disabled)]', label: 'Idle', bg: 'bg-[var(--bg-subtle)]' },
  running: { icon: 'lucide:loader-2', color: 'text-[var(--brand)]', label: 'Running', bg: 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]' },
  completed: { icon: 'lucide:check-circle', color: 'text-[var(--success)]', label: 'Completed', bg: 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' },
  failed: { icon: 'lucide:x-circle', color: 'text-[var(--error)]', label: 'Failed', bg: 'bg-[color-mix(in_srgb,var(--error)_10%,transparent)]' },
  cancelled: { icon: 'lucide:ban', color: 'text-[var(--warning)]', label: 'Cancelled', bg: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]' },
}

export function WorkflowList() {
  const { workflows, setActiveWorkflow, createWorkflow, deleteWorkflow, runWorkflow } = useWorkflow()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const handleCreate = () => {
    if (!newName.trim()) return
    const wf = createWorkflow(newName.trim(), newDesc.trim() || undefined)
    setNewName('')
    setNewDesc('')
    setShowCreate(false)
    setActiveWorkflow(wf.id)
  }

  const fmt = (ms: number) => ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60000).toFixed(1)}m`

  const fmtTime = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] shrink-0">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Workflows</h2>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{workflows.length} workflow{workflows.length !== 1 ? 's' : ''} · Build and orchestrate agent pipelines</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-semibold bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
        >
          <Icon icon="lucide:plus" width={13} height={13} />
          New Workflow
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5">
          {/* Create form */}
          {showCreate && (
            <div className="mb-5 p-4 rounded-xl border-2 border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_3%,var(--bg-elevated))] shadow-sm">
              <div className="space-y-2.5">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false) }}
                  placeholder="Workflow name…"
                  autoFocus
                  className="w-full px-3 py-2 text-[13px] rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)]"
                />
                <input
                  type="text"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Optional description…"
                  className="w-full px-3 py-1.5 text-[12px] rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)]"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] cursor-pointer">
                    Cancel
                  </button>
                  <button onClick={handleCreate} disabled={!newName.trim()} className="px-4 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 disabled:opacity-50 cursor-pointer">
                    Create Workflow
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Workflow grid — 1col mobile, 2col medium, 3col wide */}
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
            {workflows.map(wf => {
              const st = STATUS_MAP[wf.status]
              return (
                <div
                  key={wf.id}
                  onClick={() => setActiveWorkflow(wf.id)}
                  className="relative group flex flex-col p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-hover)] hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.12)] transition-all cursor-pointer"
                >
                  {/* Status accent line */}
                  <div className={`absolute top-0 left-4 right-4 h-[2px] rounded-b ${
                    wf.status === 'running' ? 'bg-[var(--brand)]' :
                    wf.status === 'completed' ? 'bg-[var(--success)]' :
                    wf.status === 'failed' ? 'bg-[var(--error)]' :
                    'bg-transparent'
                  }`} />

                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] flex items-center justify-center shrink-0">
                        <Icon icon="lucide:workflow" width={16} height={16} className="text-[var(--brand)]" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[13px] font-semibold text-[var(--text-primary)] block truncate">{wf.name}</span>
                        {wf.description && (
                          <span className="text-[10px] text-[var(--text-tertiary)] block truncate mt-0.5">{wf.description}</span>
                        )}
                      </div>
                    </div>
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium shrink-0 ml-2 ${st.color} ${st.bg}`}>
                      <Icon icon={st.icon} width={10} height={10} className={wf.status === 'running' ? 'animate-spin' : ''} />
                      {st.label}
                    </span>
                  </div>

                  {/* Node preview — spans full width */}
                  <div className="flex items-center gap-1 mb-4 py-2 px-3 rounded-lg bg-[var(--bg)] border border-[var(--border)] overflow-x-auto">
                    {wf.nodes.length > 0 ? wf.nodes.slice(0, 8).map((node, i) => (
                      <span key={node.id} className="flex items-center shrink-0">
                        {i > 0 && <Icon icon="lucide:chevron-right" width={8} height={8} className="text-[var(--text-disabled)] mx-0.5" />}
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center ${
                          node.status === 'success' ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]' :
                          node.status === 'running' ? 'bg-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[var(--brand)]' :
                          node.status === 'error' ? 'bg-[color-mix(in_srgb,var(--error)_15%,transparent)] text-[var(--error)]' :
                          'bg-[var(--bg-subtle)] text-[var(--text-disabled)]'
                        }`} title={node.label}>
                          <Icon icon={nodeKindIcon(node.kind)} width={11} height={11} />
                        </span>
                      </span>
                    )) : (
                      <span className="text-[10px] text-[var(--text-disabled)] italic py-0.5">No nodes — click to start building</span>
                    )}
                    {wf.nodes.length > 8 && (
                      <span className="text-[9px] text-[var(--text-disabled)] shrink-0 ml-1">+{wf.nodes.length - 8}</span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 mt-auto">
                    <StatPill icon="lucide:play" value={`${wf.runCount}`} label="runs" />
                    <StatPill icon="lucide:boxes" value={`${wf.nodes.length}`} label="nodes" />
                    {wf.lastRunDuration != null && (
                      <StatPill icon="lucide:timer" value={fmt(wf.lastRunDuration)} label="last" />
                    )}
                    {wf.lastRunAt && (
                      <span className="text-[9px] text-[var(--text-disabled)] ml-auto">{fmtTime(wf.lastRunAt)}</span>
                    )}
                  </div>

                  {/* Hover actions */}
                  <div className="hidden group-hover:flex items-center gap-1 absolute top-3 right-3 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)] shadow-sm p-0.5">
                    <button
                      onClick={e => { e.stopPropagation(); runWorkflow(wf.id) }}
                      className="p-1.5 rounded-md hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--text-disabled)] hover:text-[var(--success)] cursor-pointer"
                      title="Run"
                    >
                      <Icon icon="lucide:play" width={12} height={12} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); deleteWorkflow(wf.id) }}
                      className="p-1.5 rounded-md hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)] text-[var(--text-disabled)] hover:text-[var(--error)] cursor-pointer"
                      title="Delete"
                    >
                      <Icon icon="lucide:trash-2" width={12} height={12} />
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Empty state */}
            {workflows.length === 0 && !showCreate && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] flex items-center justify-center mb-4">
                  <Icon icon="lucide:workflow" width={28} height={28} className="text-[var(--brand)] opacity-60" />
                </div>
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">No workflows yet</h3>
                <p className="text-[12px] text-[var(--text-tertiary)] mb-4 max-w-[280px]">Create your first workflow to automate agent pipelines, code reviews, and deployments.</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-semibold bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 cursor-pointer"
                >
                  <Icon icon="lucide:plus" width={12} height={12} />
                  Create Workflow
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatPill({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-[var(--text-disabled)]">
      <Icon icon={icon} width={10} height={10} />
      <span className="font-mono font-medium text-[var(--text-tertiary)]">{value}</span>
      {label}
    </span>
  )
}

export function nodeKindIcon(kind: string): string {
  switch (kind) {
    case 'trigger': return 'lucide:zap'
    case 'agent': return 'lucide:bot'
    case 'tool': return 'lucide:wrench'
    case 'condition': return 'lucide:git-branch'
    case 'transform': return 'lucide:shuffle'
    case 'output': return 'lucide:flag'
    case 'human': return 'lucide:user'
    case 'loop': return 'lucide:repeat'
    default: return 'lucide:circle'
  }
}
