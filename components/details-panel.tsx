'use client'

import { useState, useEffect, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { useEditor } from '@/context/editor-context'
import { useGateway } from '@/context/gateway-context'

type Tab = 'details' | 'files'

export function DetailsPanel() {
  const { repo } = useRepo()
  const local = useLocal()
  const { files } = useEditor()
  const { status } = useGateway()
  const [tab, setTab] = useState<Tab>('details')
  const [editWidgets, setEditWidgets] = useState(false)
  
  const WIDGETS = [
    { id: 'workspace', icon: 'lucide:settings', label: 'Workspace' },
    { id: 'todos', icon: 'lucide:list-checks', label: 'To-dos' },
    { id: 'plan', icon: 'lucide:list-tree', label: 'Plan' },
    { id: 'terminal', icon: 'lucide:terminal', label: 'Terminal' },
    { id: 'changes', icon: 'lucide:git-commit-horizontal', label: 'Changes' },
    { id: 'gateway', icon: 'lucide:cpu', label: 'Gateway' },
    { id: 'openfiles', icon: 'lucide:files', label: 'Open Files' },
  ] as const
  
  const [enabledWidgets, setEnabledWidgets] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('code-editor:widgets')
      return saved ? new Set(JSON.parse(saved)) : new Set(['workspace', 'changes', 'gateway', 'openfiles'])
    } catch { return new Set(['workspace', 'changes', 'gateway', 'openfiles']) }
  })
  
  const toggleWidget = (id: string) => {
    setEnabledWidgets(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem('code-editor:widgets', JSON.stringify([...next]))
      return next
    })
  }
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['workspace', 'changes', 'gateway']))

  const repoName = repo?.fullName?.split('/').pop() ?? local.rootPath?.split('/').pop() ?? '—'
  const fullPath = repo?.fullName ?? local.rootPath ?? '—'
  const branchName = repo?.branch ?? local.gitInfo?.branch ?? '—'
  const dirtyFiles = files.filter(f => f.dirty)

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const Section = ({ id, icon, title, children, badge }: {
    id: string; icon: string; title: string; children: React.ReactNode; badge?: string | number
  }) => {
    if (!enabledWidgets.has(id)) return null
    const expanded = expandedSections.has(id)
    return (
      <div className="border-b border-[var(--border)]">
        <button
          onClick={() => toggleSection(id)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
        >
          <Icon icon={icon} width={13} height={13} className="text-[var(--text-tertiary)] shrink-0" />
          <span className="text-[11px] font-semibold text-[var(--text-primary)] flex-1">{title}</span>
          {badge !== undefined && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-tertiary)]">{badge}</span>
          )}
          <Icon icon={expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'} width={10} height={10} className="text-[var(--text-disabled)]" />
        </button>
        {expanded && (
          <div className="px-4 pb-3">
            {children}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center justify-between h-8 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 px-2">
        <div className="flex items-center gap-0">
          {(['details', 'files'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                tab === t
                  ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {t === 'details' ? 'Details' : 'Files'}
            </button>
          ))}
        </div>
        {tab === 'details' && (
          <div className="relative">
            <button
              onClick={() => setEditWidgets(v => !v)}
              className="text-[9px] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
            >
              Edit widgets
            </button>
            {editWidgets && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setEditWidgets(false)} />
                <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-xl py-1.5 z-50">
                  <div className="px-3 py-1 text-[9px] font-semibold text-[var(--text-disabled)] uppercase tracking-wider">Widgets</div>
                  {WIDGETS.map(w => (
                    <button
                      key={w.id}
                      onClick={() => toggleWidget(w.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                    >
                      <Icon icon="lucide:grip-vertical" width={8} height={8} className="text-[var(--text-disabled)]" />
                      <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-white shrink-0 ${
                        enabledWidgets.has(w.id) ? 'bg-[var(--brand)]' : 'border border-[var(--border)] bg-[var(--bg)]'
                      }`}>
                        {enabledWidgets.has(w.id) && <Icon icon="lucide:check" width={9} height={9} />}
                      </span>
                      <Icon icon={w.icon} width={11} height={11} className="text-[var(--text-tertiary)]" />
                      <span className="text-[10px] text-[var(--text-secondary)]">{w.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'details' ? (
          <>
            {/* Workspace */}
            <Section id="workspace" icon="lucide:settings" title="Workspace">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:git-branch" width={11} height={11} className="text-[var(--text-disabled)] shrink-0" />
                  <span className="text-[10px] text-[var(--text-tertiary)] w-12">Branch</span>
                  <span className="text-[10px] font-mono text-[var(--text-primary)]">{branchName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:folder" width={11} height={11} className="text-[var(--text-disabled)] shrink-0" />
                  <span className="text-[10px] text-[var(--text-tertiary)] w-12">Path</span>
                  <span className="text-[10px] font-mono text-[var(--text-primary)] truncate">{repoName}</span>
                </div>
                {repo?.fullName && (
                  <div className="flex items-center gap-2">
                    <Icon icon="lucide:github" width={11} height={11} className="text-[var(--text-disabled)] shrink-0" />
                    <span className="text-[10px] text-[var(--text-tertiary)] w-12">Remote</span>
                    <span className="text-[10px] font-mono text-[var(--text-primary)] truncate">{repo.fullName}</span>
                  </div>
                )}
              </div>
            </Section>

            {/* To-dos */}
            <Section id="todos" icon="lucide:list-checks" title="To-dos">
              <p className="text-[10px] text-[var(--text-disabled)]">No to-dos yet</p>
            </Section>

            {/* Plan */}
            <Section id="plan" icon="lucide:list-tree" title="Plan">
              <p className="text-[10px] text-[var(--text-disabled)]">No active plan</p>
            </Section>

            {/* Terminal */}
            <Section id="terminal" icon="lucide:terminal" title="Terminal">
              <button
                onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', metaKey: true }))}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
              >
                <Icon icon="lucide:plus" width={10} height={10} />
                Open Terminal
              </button>
            </Section>

            {/* Changes */}
            <Section id="changes" icon="lucide:git-commit-horizontal" title={`Changes on ${branchName}`} badge={dirtyFiles.length || undefined}>
              {dirtyFiles.length > 0 ? (
                <div className="space-y-1.5">
                  {/* Stats */}
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-[var(--color-additions)] font-mono">+{dirtyFiles.reduce((s, f) => s + Math.max(0, f.content.split('\n').length - f.originalContent.split('\n').length), 0)}</span>
                    <span className="text-[var(--color-deletions)] font-mono">-{dirtyFiles.reduce((s, f) => s + Math.max(0, f.originalContent.split('\n').length - f.content.split('\n').length), 0)}</span>
                  </div>
                  {/* File checkboxes */}
                  {dirtyFiles.map(f => (
                    <label key={f.path} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[var(--bg-subtle)] cursor-pointer">
                      <input type="checkbox" defaultChecked className="accent-[var(--brand)] rounded" />
                      <Icon icon="lucide:file-code-2" width={10} height={10} className="text-[var(--text-tertiary)] shrink-0" />
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate">{f.path}</span>
                    </label>
                  ))}
                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('open-git-panel'))}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold bg-[var(--brand)] text-white hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Commit & Push {dirtyFiles.length} file{dirtyFiles.length !== 1 ? 's' : ''}
                    </button>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('open-git-panel'))}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-medium text-[var(--text-secondary)] bg-[var(--bg)] border border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                    >
                      View Diff
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-[var(--text-disabled)]">No changes</p>
              )}
            </Section>

            {/* Gateway / MCP */}
            <Section id="gateway" icon="lucide:cpu" title="OpenClaw Gateway">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-[var(--color-additions)]' : 'bg-[var(--text-disabled)]'}`} />
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {status === 'connected' ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                {status !== 'connected' && (
                  <p className="text-[10px] text-[var(--text-disabled)]">Connect gateway to enable AI features</p>
                )}
              </div>
            </Section>

            {/* Open Files */}
            <Section id="openfiles" icon="lucide:files" title="Open Files" badge={files.length || undefined}>
              {files.length > 0 ? (
                <div className="space-y-0.5">
                  {files.map(f => (
                    <button
                      key={f.path}
                      onClick={() => window.dispatchEvent(new CustomEvent('file-select', { detail: { path: f.path, sha: f.sha } }))}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                    >
                      <Icon icon="lucide:file-code-2" width={10} height={10} className="text-[var(--text-disabled)] shrink-0" />
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate flex-1">{f.path.split('/').pop()}</span>
                      {f.dirty && <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning,#eab308)] shrink-0" />}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-[var(--text-disabled)]">No files open</p>
              )}
            </Section>
          </>
        ) : (
          /* Files tab — shows repo tree */
          <div className="py-2">
            {files.length > 0 ? (
              <div className="space-y-0.5 px-2">
                {files.map(f => (
                  <button
                    key={f.path}
                    onClick={() => window.dispatchEvent(new CustomEvent('file-select', { detail: { path: f.path, sha: f.sha } }))}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                  >
                    <Icon icon="lucide:file-code-2" width={11} height={11} className="text-[var(--text-tertiary)]" />
                    <span className="text-[10px] font-mono text-[var(--text-secondary)] flex-1 truncate">{f.path}</span>
                    {f.dirty && (
                      <span className="text-[8px] font-mono text-[var(--warning,#eab308)]">Modified</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <Icon icon="lucide:file-question" width={24} height={24} className="text-[var(--text-disabled)] mb-2" />
                <p className="text-[10px] text-[var(--text-disabled)]">No files in workspace</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
