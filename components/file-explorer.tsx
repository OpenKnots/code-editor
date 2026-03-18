'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useRepo, type TreeNode } from '@/context/repo-context'
import { emit } from '@/lib/events'
import { useEditor } from '@/context/editor-context'
import { useLocal } from '@/context/local-context'

// ─── Context menu ───────────────────────────────────────────

interface ContextMenuState {
  x: number
  y: number
  path: string
  isDir: boolean
}

function FileContextMenu({
  menu,
  onDelete,
  onClose,
}: {
  menu: ContextMenuState
  onDelete: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-[9999] min-w-[140px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-lg)] animate-fade-in"
      style={{ top: menu.y, left: menu.x, animationDuration: '0.1s' }}
    >
      <button
        onClick={onDelete}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[var(--color-deletions)] transition-colors hover:bg-[var(--bg-subtle)] cursor-pointer"
      >
        <Icon icon="lucide:trash-2" width={13} height={13} />
        Delete
      </button>
    </div>
  )
}

function DeleteConfirmDialog({
  path,
  isDir,
  onConfirm,
  onCancel,
}: {
  path: string
  isDir: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const name = path.split('/').pop() ?? path

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="w-[340px] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-xl)] animate-fade-in"
        style={{ animationDuration: '0.15s' }}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div className="rounded-lg bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)] p-2">
            <Icon
              icon="lucide:trash-2"
              width={16}
              height={16}
              className="text-[var(--color-deletions)]"
            />
          </div>
          <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
            Delete {isDir ? 'folder' : 'file'}?
          </h3>
        </div>
        <p className="text-[12px] text-[var(--text-secondary)] mb-4 leading-relaxed">
          Are you sure you want to delete{' '}
          <span className="font-mono text-[11px] px-1 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-primary)]">
            {name}
          </span>
          ?{isDir && ' This will delete all contents inside it.'} This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--on-deletions)] bg-[var(--color-deletions)] hover:opacity-90 transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── File icon mapping ──────────────────────────────────────────

const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  ts: { icon: 'lucide:file-code', color: 'var(--syntax-type)' },
  tsx: { icon: 'lucide:file-code', color: 'var(--syntax-type)' },
  js: { icon: 'lucide:file-code', color: 'var(--syntax-number)' },
  jsx: { icon: 'lucide:file-code', color: 'var(--syntax-number)' },
  json: { icon: 'lucide:file-json', color: 'var(--syntax-string)' },
  md: { icon: 'lucide:file-text', color: 'var(--info)' },
  css: { icon: 'lucide:file-code', color: 'var(--syntax-keyword)' },
  html: { icon: 'lucide:file-code', color: 'var(--error)' },
  py: { icon: 'lucide:file-code', color: 'var(--syntax-function)' },
  rs: { icon: 'lucide:file-code', color: 'var(--warning)' },
  go: { icon: 'lucide:file-code', color: 'var(--info)' },
}

function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return FILE_ICONS[ext] ?? { icon: 'lucide:file', color: 'var(--text-tertiary)' }
}

// ─── Tree building ──────────────────────────────────────────────

interface TreeDir {
  name: string
  path: string
  children: (TreeDir | TreeFile)[]
  type: 'dir'
}

interface TreeFile {
  name: string
  path: string
  sha: string
  size?: number
  type: 'file'
}

function buildTree(nodes: TreeNode[]): (TreeDir | TreeFile)[] {
  if (!Array.isArray(nodes)) return []
  const root: TreeDir = { name: '', path: '', children: [], type: 'dir' }

  for (const node of nodes) {
    const parts = node.path.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!
      const isLast = i === parts.length - 1

      if (isLast && node.type === 'blob') {
        current.children.push({
          name,
          path: node.path,
          sha: node.sha,
          size: node.size,
          type: 'file',
        })
      } else {
        let dir = current.children.find((c): c is TreeDir => c.type === 'dir' && c.name === name)
        if (!dir) {
          dir = { name, path: parts.slice(0, i + 1).join('/'), children: [], type: 'dir' }
          current.children.push(dir)
        }
        current = dir
      }
    }
  }

  // Sort: dirs first, then files, alphabetical
  function sortChildren(node: TreeDir) {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const child of node.children) {
      if (child.type === 'dir') sortChildren(child)
    }
  }
  sortChildren(root)
  return root.children
}

// ─── Tree Item ──────────────────────────────────────────────────

function DirItem({
  dir,
  depth,
  onContextMenu,
  focusPath,
  setFocusPath,
}: {
  dir: TreeDir
  depth: number
  onContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void
  focusPath: string
  setFocusPath: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const childFileCount = dir.children.filter((c) => c.type === 'file').length
  const childDirCount = dir.children.filter((c) => c.type === 'dir').length

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        onContextMenu={(e) => onContextMenu(e, dir.path, true)}
        onFocus={() => setFocusPath(dir.path)}
        tabIndex={focusPath === dir.path ? 0 : -1}
        data-explorer-item="dir"
        data-path={dir.path}
        data-depth={depth}
        data-expanded={expanded}
        className="group flex w-full items-center gap-1.5 rounded-sm py-[3px] text-left transition-colors hover:bg-[var(--bg-subtle)] focus:bg-[var(--bg-subtle)] cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <Icon
          icon={expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'}
          width={12}
          height={12}
          className="shrink-0 text-[var(--text-tertiary)]"
          style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(0deg)' }}
        />
        <Icon
          icon={expanded ? 'lucide:folder-open' : 'lucide:folder'}
          width={14}
          height={14}
          className="shrink-0 text-[var(--brand)]"
        />
        <span className="truncate text-[12px] text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]">
          {dir.name}
        </span>
        {!expanded && childFileCount + childDirCount > 0 && (
          <span className="ml-auto mr-2 text-[9px] text-[var(--text-disabled)] opacity-0 group-hover:opacity-100 transition-opacity">
            {childDirCount > 0 && `${childDirCount}d`}
            {childDirCount > 0 && childFileCount > 0 && ' '}
            {childFileCount > 0 && `${childFileCount}f`}
          </span>
        )}
      </button>
      {expanded && (
        <div className="animate-fade-in" style={{ animationDuration: '0.15s' }}>
          {dir.children.map((child) =>
            child.type === 'dir' ? (
              <DirItem
                key={child.path}
                dir={child}
                depth={depth + 1}
                onContextMenu={onContextMenu}
                focusPath={focusPath}
                setFocusPath={setFocusPath}
              />
            ) : (
              <FileItem
                key={child.path}
                file={child}
                depth={depth + 1}
                onContextMenu={onContextMenu}
                focusPath={focusPath}
                setFocusPath={setFocusPath}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

const GIT_STATUS_COLORS: Record<string, { color: string; label: string }> = {
  M: { color: 'var(--warning, #eab308)', label: 'Modified' },
  A: { color: 'var(--color-additions, #22c55e)', label: 'Added' },
  D: { color: 'var(--color-deletions, #ef4444)', label: 'Deleted' },
  R: { color: 'var(--info, #3b82f6)', label: 'Renamed' },
  U: { color: 'var(--color-additions, #22c55e)', label: 'Untracked' },
  '?': { color: 'var(--text-tertiary)', label: 'Untracked' },
}

function FileItem({
  file,
  depth,
  onContextMenu,
  focusPath,
  setFocusPath,
}: {
  file: TreeFile
  depth: number
  onContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void
  focusPath: string
  setFocusPath: (path: string) => void
}) {
  const { activeFile } = useEditor()
  const local = useLocal()
  const gitStatus = local.gitInfo?.status.find((s) => s.path === file.path)?.status
  const isActive = activeFile === file.path
  const icon = getFileIcon(file.path)
  const statusInfo = gitStatus ? GIT_STATUS_COLORS[gitStatus] : null

  const handleClick = async () => {
    // Typed event bus
    emit('file-select', { path: file.path, sha: file.sha })
  }

  return (
    <button
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu(e, file.path, false)}
      onFocus={() => setFocusPath(file.path)}
      tabIndex={focusPath === file.path ? 0 : -1}
      data-explorer-item="file"
      data-path={file.path}
      data-depth={depth}
      className={`group flex w-full items-center gap-1.5 rounded-sm py-[3px] text-left transition-colors focus:bg-[var(--bg-subtle)] cursor-pointer ${
        isActive
          ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--text-primary)]'
          : 'hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
      }`}
      style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
    >
      <Icon
        icon={icon.icon}
        width={14}
        height={14}
        style={{ color: icon.color }}
        className="shrink-0"
      />
      <span
        className={`text-[12px] truncate group-hover:text-[var(--text-primary)] transition-colors ${
          statusInfo ? '' : ''
        }`}
        style={statusInfo ? { color: statusInfo.color } : undefined}
      >
        {file.name}
      </span>
      {statusInfo && (
        <span
          className="ml-auto mr-2 text-[9px] font-bold shrink-0 opacity-70"
          style={{ color: statusInfo.color }}
          title={statusInfo.label}
        >
          {gitStatus}
        </span>
      )}
    </button>
  )
}

// ─── Explorer ───────────────────────────────────────────────────

export function FileExplorer() {
  const { repo, tree, treeLoading, treeError, loadTree } = useRepo()
  const local = useLocal()
  const { closeFile, closeFilesUnder, activeFile } = useEditor()

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; isDir: boolean } | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, isDir: boolean) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, path, isDir })
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await local.deletePath(deleteTarget.path)
      if (deleteTarget.isDir) {
        closeFilesUnder(deleteTarget.path)
      } else {
        closeFile(deleteTarget.path)
      }
      await local.refresh()
    } catch (err) {
      console.error('Delete failed:', err)
    }
    setDeleteTarget(null)
  }, [deleteTarget, local, closeFile, closeFilesUnder])

  // Convert local tree entries to TreeNode format for unified rendering
  const effectiveTree: TreeNode[] = useMemo(() => {
    if (local.localMode && local.localTree.length > 0) {
      return local.localTree.map((e) => ({
        path: e.path,
        type: e.is_dir ? ('tree' as const) : ('blob' as const),
        sha: '',
      }))
    }
    return tree
  }, [local.localMode, local.localTree, tree])
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (repo) loadTree()
  }, [repo, loadTree])

  const treeNodes = useMemo(() => buildTree(effectiveTree), [effectiveTree])

  const filteredTree = useMemo(() => {
    if (!search.trim()) return treeNodes
    const term = search.toLowerCase()
    const matches = effectiveTree.filter(
      (n) => n.type === 'blob' && n.path.toLowerCase().includes(term),
    )
    return buildTree(matches)
  }, [effectiveTree, treeNodes, search])

  const fileCount = useMemo(
    () => effectiveTree.filter((n) => n.type === 'blob').length,
    [effectiveTree],
  )

  // ─── Keyboard-first explorer navigation ──────────────────────────
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [focusPath, setFocusPath] = useState<string>('')

  useEffect(() => {
    if (activeFile && !focusPath) setFocusPath(activeFile)
  }, [activeFile, focusPath])

  const firstVisiblePath = useMemo(() => {
    const walk = (nodes: (TreeDir | TreeFile)[]): string | null => {
      for (const n of nodes) {
        if (n.type === 'dir') return n.path
        return n.path
      }
      return null
    }
    return walk(filteredTree) ?? ''
  }, [filteredTree])

  useEffect(() => {
    if (!focusPath) {
      if (activeFile) setFocusPath(activeFile)
      else if (firstVisiblePath) setFocusPath(firstVisiblePath)
      return
    }
    // If the current focus path is filtered out, fall back.
    const container = listRef.current
    if (!container) return
    const esc = (globalThis as any).CSS?.escape
      ? (globalThis as any).CSS.escape(focusPath)
      : focusPath.replace(/["\\]/g, '\\$&')
    const exists = Boolean(container.querySelector(`[data-path="${esc}"]`))
    if (!exists) {
      if (activeFile) setFocusPath(activeFile)
      else if (firstVisiblePath) setFocusPath(firstVisiblePath)
    }
  }, [activeFile, firstVisiblePath, focusPath])

  useEffect(() => {
    const onFocusTree = () => {
      searchRef.current?.focus()
    }
    const onExplorerSearch = (e: Event) => {
      const query = (e as CustomEvent).detail?.query as string | undefined
      if (typeof query === 'string') setSearch(query)
      searchRef.current?.focus()
    }
    window.addEventListener('focus-tree', onFocusTree)
    window.addEventListener('explorer-search', onExplorerSearch)
    return () => {
      window.removeEventListener('focus-tree', onFocusTree)
      window.removeEventListener('explorer-search', onExplorerSearch)
    }
  }, [])

  const focusItemByIndex = useCallback((idx: number) => {
    const container = listRef.current
    if (!container) return
    const items = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-explorer-item]'))
    const el = items[idx]
    if (!el) return
    el.focus()
    const p = el.dataset.path
    if (p) setFocusPath(p)
  }, [])

  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const container = listRef.current
      if (!container) return

      const active = document.activeElement as HTMLElement | null
      const activeIsSearch = active === searchRef.current
      const activeBtn = active?.closest?.('[data-explorer-item]') as HTMLButtonElement | null

      const items = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[data-explorer-item]'),
      )
      if (items.length === 0) return

      if (activeIsSearch && e.key === 'ArrowDown') {
        e.preventDefault()
        focusItemByIndex(0)
        return
      }

      if (!activeBtn) return

      const idx = Math.max(0, items.indexOf(activeBtn))
      const cur = items[idx]
      const curType = cur?.dataset.explorerItem
      const curDepth = parseInt(cur?.dataset.depth ?? '0') || 0
      const curExpanded = cur?.dataset.expanded === 'true'

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        focusItemByIndex(Math.min(items.length - 1, idx + 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        focusItemByIndex(Math.max(0, idx - 1))
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        focusItemByIndex(0)
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        focusItemByIndex(items.length - 1)
        return
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        cur?.click()
        return
      }

      if (e.key === 'ArrowRight' && curType === 'dir') {
        e.preventDefault()
        if (!curExpanded) {
          cur.click()
          return
        }
        const next = items[idx + 1]
        const nextDepth = parseInt(next?.dataset.depth ?? '0') || 0
        if (next && nextDepth > curDepth) {
          next.focus()
          const p = next.dataset.path
          if (p) setFocusPath(p)
        }
        return
      }

      if (e.key === 'ArrowLeft') {
        if (curType === 'dir' && curExpanded) {
          e.preventDefault()
          cur.click()
          return
        }
        // Focus parent directory (nearest previous item with smaller depth)
        for (let i = idx - 1; i >= 0; i--) {
          const it = items[i]
          const d = parseInt(it.dataset.depth ?? '0') || 0
          if (d < curDepth) {
            e.preventDefault()
            it.focus()
            const p = it.dataset.path
            if (p) setFocusPath(p)
            return
          }
        }
      }
    },
    [focusItemByIndex],
  )

  if (!repo && !local.localMode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4 bg-[var(--sidebar-bg)]">
        <Icon
          icon="lucide:folder-open"
          width={32}
          height={32}
          className="text-[var(--text-tertiary)] mb-3"
        />
        <p className="text-[12px] text-[var(--text-secondary)]">No repo selected</p>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
          Select a repository to explore
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--sidebar-bg)]">
      {/* Brand accent bar */}
      <div className="h-px shrink-0 bg-[var(--border)]" />
      {/* Header with project name + folder trigger */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--sidebar-bg)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => local.openFolder()}
            className="group -mx-1 flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-[var(--bg-subtle)] cursor-pointer"
            title={local.rootPath ?? 'Open folder'}
          >
            <Icon
              icon="lucide:folder-open"
              width={13}
              height={13}
              className="shrink-0 text-[var(--brand)]"
            />
            <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
              {local.rootPath?.split('/').pop() ||
                (repo ? repo.repo.split('/').pop() : 'Open Folder')}
            </span>
            {fileCount > 0 && (
              <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--text-tertiary)]">
                {fileCount}
              </span>
            )}
          </button>
          <button
            disabled={treeLoading}
            onClick={() => (local.localMode ? local.refresh() : loadTree())}
            className="shrink-0 rounded p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
            title="Refresh"
          >
            <Icon
              icon={treeLoading ? 'lucide:loader-2' : 'lucide:refresh-cw'}
              width={12}
              height={12}
              className={treeLoading ? 'animate-spin' : ''}
            />
          </button>
        </div>
        <div className="relative mt-1.5">
          <Icon
            icon="lucide:search"
            width={12}
            height={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            ref={searchRef}
            className="w-full pl-7 pr-2 py-1 rounded bg-[var(--bg-subtle)] border border-[var(--border)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--border-focus)]"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1" ref={listRef} onKeyDown={onListKeyDown}>
        {/* Local mode: no folder selected */}
        {local.localMode && !local.rootPath && effectiveTree.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <Icon
              icon="lucide:folder-open"
              width={32}
              height={32}
              className="text-[var(--text-disabled)]"
            />
            <div>
              <p className="text-[12px] text-[var(--text-secondary)] mb-1">No folder open</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">
                Open a project folder to browse and edit files locally.
              </p>
            </div>
            <button
              onClick={local.openFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
              style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-contrast, #fff)' }}
            >
              <Icon icon="lucide:folder-plus" width={13} height={13} />
              Open Folder
            </button>
          </div>
        )}
        {/* Loading */}
        {treeLoading && effectiveTree.length === 0 && !local.localMode && (
          <div className="flex items-center gap-2 px-3 py-4 text-[11px] text-[var(--text-secondary)]">
            <Icon
              icon="lucide:loader-2"
              width={14}
              height={14}
              className="animate-spin text-[var(--brand)]"
            />
            Loading tree...
          </div>
        )}
        {treeError && !local.localMode && (
          <div className="px-3 py-2 text-[13px] text-[var(--color-deletions)]">{treeError}</div>
        )}
        {filteredTree.map((node) =>
          node.type === 'dir' ? (
            <DirItem
              key={node.path}
              dir={node}
              depth={0}
              onContextMenu={handleContextMenu}
              focusPath={focusPath}
              setFocusPath={setFocusPath}
            />
          ) : (
            <FileItem
              key={node.path}
              file={node as TreeFile}
              depth={0}
              onContextMenu={handleContextMenu}
              focusPath={focusPath}
              setFocusPath={setFocusPath}
            />
          ),
        )}
      </div>

      {contextMenu && (
        <FileContextMenu
          menu={contextMenu}
          onDelete={() => {
            setDeleteTarget({ path: contextMenu.path, isDir: contextMenu.isDir })
            setContextMenu(null)
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          path={deleteTarget.path}
          isDir={deleteTarget.isDir}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
