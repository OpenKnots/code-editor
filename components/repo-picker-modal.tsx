'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'

interface Props {
  open: boolean
  onClose: () => void
  onSelectFolder: () => void
  onCloneUrl: (url: string) => void
}

export function RepoPickerModal({ open, onClose, onSelectFolder, onCloneUrl }: Props) {
  const [cloneUrl, setCloneUrl] = useState('')
  const [tab, setTab] = useState<'folder' | 'clone'>('folder')

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-[440px] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[color-mix(in_srgb,var(--brand)_20%,var(--bg-elevated))] to-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center mb-4 shadow-lg">
            <Icon icon="lucide:folder-git-2" width={28} height={28} className="text-[var(--brand)]" />
          </div>
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">Select a repository</h2>
          <p className="text-[11px] text-[var(--text-tertiary)]">Open a local folder or clone from GitHub</p>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 mx-6 mb-4 p-0.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
          {(['folder', 'clone'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                tab === t
                  ? 'bg-[var(--bg)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon icon={t === 'folder' ? 'lucide:folder-open' : 'lucide:git-branch'} width={12} height={12} />
              {t === 'folder' ? 'Local Folder' : 'Clone from GitHub'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {tab === 'folder' ? (
            <div className="flex flex-col items-center py-4">
              <p className="text-[11px] text-[var(--text-tertiary)] mb-4 text-center">
                Choose a folder on your machine to open as a workspace
              </p>
              <button
                onClick={() => { onSelectFolder(); onClose() }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[12px] font-semibold bg-[var(--brand)] text-white hover:opacity-90 transition-opacity cursor-pointer shadow-md"
              >
                <Icon icon="lucide:folder-open" width={14} height={14} />
                Select Folder
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 py-2">
              <div className="relative">
                <Icon icon="lucide:link" width={12} height={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
                <input
                  type="text"
                  value={cloneUrl}
                  onChange={e => setCloneUrl(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && cloneUrl.trim()) {
                      onCloneUrl(cloneUrl.trim())
                      onClose()
                    }
                  }}
                  placeholder="https://github.com/owner/repo"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[color-mix(in_srgb,var(--brand)_50%,var(--border))] transition-colors"
                />
              </div>
              <button
                onClick={() => { if (cloneUrl.trim()) { onCloneUrl(cloneUrl.trim()); onClose() } }}
                disabled={!cloneUrl.trim()}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all cursor-pointer ${
                  cloneUrl.trim()
                    ? 'bg-[var(--brand)] text-white hover:opacity-90 shadow-md'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'
                }`}
              >
                <Icon icon="lucide:git-branch" width={14} height={14} />
                Clone Repository
              </button>
            </div>
          )}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
        >
          <Icon icon="lucide:x" width={14} height={14} />
        </button>
      </div>
    </div>
  )
}
