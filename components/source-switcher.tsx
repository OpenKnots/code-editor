'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useLocal, getRecentFolders } from '@/context/local-context'

function BranchDropdown({
  current,
  branches,
  onSwitch,
}: {
  current: string
  branches: string[]
  onSwitch: (branch: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
        title="Switch branch"
      >
        <Icon icon="lucide:git-branch" width={11} height={11} />
        <span className="text-[11px] font-mono">{current}</span>
        <Icon icon="lucide:chevron-down" width={9} height={9} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-[92] w-[260px] max-h-[340px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
          <div className="px-3 py-1.5 text-[10px] text-[var(--text-disabled)] uppercase tracking-wider border-b border-[var(--border)]">
            Branches
          </div>
          {error && (
            <div className="px-3 py-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)]">
              <div className="flex items-start gap-1.5">
                <Icon
                  icon="lucide:alert-triangle"
                  width={11}
                  height={11}
                  className="text-[var(--color-deletions)] shrink-0 mt-0.5"
                />
                <span className="text-[12px] text-[var(--color-deletions)] leading-snug">
                  {error}
                </span>
              </div>
            </div>
          )}
          {branches.map((branch) => {
            const isActive = branch === current
            return (
              <button
                key={branch}
                disabled={switching}
                onClick={async () => {
                  if (isActive) {
                    setOpen(false)
                    return
                  }
                  setSwitching(true)
                  setError(null)
                  try {
                    await onSwitch(branch)
                    setOpen(false)
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    setError(
                      msg.includes('overwritten by checkout')
                        ? 'Commit or stash your changes before switching branches.'
                        : `Switch failed: ${msg}`,
                    )
                  }
                  setSwitching(false)
                }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-[11px] font-mono transition-colors cursor-pointer disabled:opacity-50 ${
                  isActive
                    ? 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--brand)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon
                  icon={isActive ? 'lucide:check' : 'lucide:git-branch'}
                  width={11}
                  height={11}
                  className="shrink-0"
                />
                <span className="truncate flex-1 text-left">{branch}</span>
              </button>
            )
          })}
          {branches.length === 0 && (
            <div className="px-3 py-3 text-[11px] text-[var(--text-tertiary)] text-center">
              No branches found
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function SourceSwitcher() {
  const local = useLocal()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const recentFolders = getRecentFolders()
  const folderName = local.rootPath?.split('/').pop() ?? ''

  return (
    <div className="flex items-center gap-1.5" ref={dropRef}>
      <div className="flex items-center gap-1">
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            <Icon
              icon="lucide:folder-open"
              width={13}
              height={13}
              className="text-[var(--brand)]"
            />
            <span className="text-[var(--text-primary)] font-medium max-w-[140px] truncate">
              {folderName || 'Open Folder'}
            </span>
            <Icon
              icon="lucide:chevron-down"
              width={11}
              height={11}
              className="text-[var(--text-tertiary)]"
            />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-[calc(100%+4px)] z-[91] w-[280px] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden">
              <button
                onClick={() => {
                  local.openFolder()
                  setDropdownOpen(false)
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
              >
                <Icon
                  icon="lucide:folder-plus"
                  width={13}
                  height={13}
                  className="text-[var(--brand)]"
                />
                Open Folder…
              </button>

              {local.isWebFS && (
                <div className="px-3 py-1.5 text-[10px] text-[var(--text-tertiary)] border-t border-[var(--border)] flex items-center gap-1.5">
                  <Icon icon="lucide:globe" width={10} height={10} />
                  Using browser File System Access
                </div>
              )}

              {!local.isWebFS && recentFolders.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] text-[var(--text-disabled)] uppercase tracking-wider border-t border-[var(--border)]">
                    Recent
                  </div>
                  {recentFolders.map((path) => {
                    const name = path.split('/').pop() ?? path
                    const isActive = path === local.rootPath
                    return (
                      <button
                        key={path}
                        onClick={() => {
                          local.setRootPath(path)
                          setDropdownOpen(false)
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--brand)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                        }`}
                        title={path}
                      >
                        <Icon icon="lucide:folder" width={12} height={12} />
                        <span className="truncate flex-1 text-left">{name}</span>
                        {isActive && <Icon icon="lucide:check" width={11} height={11} />}
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>

        {local.gitInfo?.is_repo && (
          <BranchDropdown
            current={local.gitInfo.branch}
            branches={local.branches}
            onSwitch={local.switchBranch}
          />
        )}
      </div>
    </div>
  )
}

/** Compact folder indicator for the status bar — click to switch folder */
export function FolderIndicator() {
  const local = useLocal()
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const recentFolders = getRecentFolders()
  const folderName = local.rootPath?.split('/').pop() ?? null

  const toggle = () => {
    setMenuOpen((v) => {
      if (!v && btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect()
        setMenuPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 })
      }
      return !v
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        onClick={toggle}
        className="flex items-center gap-1 cursor-pointer hover:text-[var(--text-secondary)] transition-colors text-[var(--text-tertiary)]"
        title={local.rootPath ?? 'No folder open — click to open'}
      >
        <Icon icon="lucide:folder-open" width={10} height={10} />
        <span className="max-w-[120px] truncate">{folderName ?? 'Open Folder'}</span>
        <Icon
          icon="lucide:chevron-up"
          width={8}
          height={8}
          className="text-[var(--text-disabled)]"
        />
      </button>

      {menuOpen && menuPos && (
        <>
          <div className="fixed inset-0 z-[9990]" onClick={() => setMenuOpen(false)} />
          <div
            ref={ref}
            className="fixed z-[9991] w-[260px] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden py-0.5"
            style={{ left: menuPos.left, bottom: menuPos.bottom }}
          >
            <button
              onClick={() => {
                local.openFolder()
                setMenuOpen(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
            >
              <Icon
                icon="lucide:folder-plus"
                width={12}
                height={12}
                className="text-[var(--brand)]"
              />
              Open Folder…
            </button>

            {!local.isWebFS && recentFolders.length > 0 && (
              <>
                <div className="px-3 py-1 text-[9px] text-[var(--text-disabled)] uppercase tracking-wider border-t border-[var(--border)]">
                  Recent
                </div>
                {recentFolders.map((path) => {
                  const name = path.split('/').pop() ?? path
                  const isActive = path === local.rootPath
                  return (
                    <button
                      key={path}
                      onClick={() => {
                        local.setRootPath(path)
                        setMenuOpen(false)
                      }}
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--brand)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                      }`}
                      title={path}
                    >
                      <Icon icon="lucide:folder" width={11} height={11} />
                      <span className="truncate flex-1 text-left">{name}</span>
                      {isActive && <Icon icon="lucide:check" width={10} height={10} />}
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
