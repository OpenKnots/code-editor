'use client'

import { useState, useMemo, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useRepo, type TreeNode } from '@/context/repo-context'
import { useEditor } from '@/context/editor-context'
import { useLocal } from '@/context/local-context'

// ─── File icon mapping ──────────────────────────────────────────

const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  ts: { icon: 'lucide:file-code', color: '#3178c6' },
  tsx: { icon: 'lucide:file-code', color: '#3178c6' },
  js: { icon: 'lucide:file-code', color: '#f7df1e' },
  jsx: { icon: 'lucide:file-code', color: '#f7df1e' },
  json: { icon: 'lucide:file-json', color: '#5da545' },
  md: { icon: 'lucide:file-text', color: '#519aba' },
  css: { icon: 'lucide:file-code', color: '#563d7c' },
  html: { icon: 'lucide:file-code', color: '#e34c26' },
  py: { icon: 'lucide:file-code', color: '#3572a5' },
  rs: { icon: 'lucide:file-code', color: '#dea584' },
  go: { icon: 'lucide:file-code', color: '#00add8' },
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
        current.children.push({ name, path: node.path, sha: node.sha, size: node.size, type: 'file' })
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

function DirItem({ dir, depth }: { dir: TreeDir; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1)

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left py-[3px] hover:bg-[var(--bg-subtle)] rounded-sm transition-colors cursor-pointer group"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <Icon
          icon={expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'}
          width={12} height={12}
          className="text-[var(--text-tertiary)] shrink-0"
        />
        <Icon
          icon={expanded ? 'lucide:folder-open' : 'lucide:folder'}
          width={14} height={14}
          className="text-[var(--brand)] shrink-0"
        />
        <span className="text-[12px] text-[var(--text-secondary)] truncate group-hover:text-[var(--text-primary)]">
          {dir.name}
        </span>
      </button>
      {expanded && (
        <div>
          {dir.children.map(child =>
            child.type === 'dir'
              ? <DirItem key={child.path} dir={child} depth={depth + 1} />
              : <FileItem key={child.path} file={child} depth={depth + 1} />
          )}
        </div>
      )}
    </div>
  )
}

function FileItem({ file, depth }: { file: TreeFile; depth: number }) {
  const { activeFile } = useEditor()
  const local = useLocal()
  const gitStatus = local.gitInfo?.status.find(s => s.path === file.path)?.status
  const isActive = activeFile === file.path
  const icon = getFileIcon(file.path)

  const handleClick = async () => {
    // File opening is handled by the parent via onFileSelect
    const event = new CustomEvent('file-select', { detail: { path: file.path, sha: file.sha } })
    window.dispatchEvent(event)
  }

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 w-full text-left py-[3px] rounded-sm transition-colors cursor-pointer group ${
        isActive
          ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--text-primary)]'
          : 'hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
      }`}
      style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
    >
      <Icon icon={icon.icon} width={14} height={14} style={{ color: icon.color }} className="shrink-0" />
      <span className="text-[12px] truncate group-hover:text-[var(--text-primary)]">
        {file.name}
      </span>
    </button>
  )
}

// ─── Explorer ───────────────────────────────────────────────────

export function FileExplorer() {
  const { repo, tree, treeLoading, treeError, loadTree } = useRepo()
  const local = useLocal()

  // Convert local tree entries to TreeNode format for unified rendering
  const effectiveTree: TreeNode[] = useMemo(() => {
    if (local.localMode && local.localTree.length > 0) {
      return local.localTree.map(e => ({
        path: e.path,
        type: e.is_dir ? 'tree' as const : 'blob' as const,
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
    const matches = effectiveTree.filter(n => n.type === 'blob' && n.path.toLowerCase().includes(term))
    return buildTree(matches)
  }, [effectiveTree, treeNodes, search])

  if (!repo && !local.localMode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4 bg-[var(--sidebar-bg)]">
        <Icon icon="lucide:folder-open" width={32} height={32} className="text-[var(--text-tertiary)] mb-3" />
        <p className="text-[12px] text-[var(--text-secondary)]">No repo selected</p>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Select a repository to explore</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--sidebar-bg)]">
      {/* Brand accent bar */}
      <div className="h-[2px] shrink-0 bg-gradient-to-r from-[var(--brand)] via-[color-mix(in_srgb,var(--brand)_50%,transparent)] to-transparent opacity-70" />
      {/* Header */}
      <div className="px-3 py-2 border-b border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_4%,var(--sidebar-bg))] shrink-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate uppercase tracking-wider">
            Explorer
          </span>
          <button
            
            disabled={treeLoading}
            onClick={() => local.localMode ? local.refresh() : loadTree()}
            className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Refresh"
          >
            <Icon icon={treeLoading ? 'lucide:loader-2' : 'lucide:refresh-cw'} width={12} height={12} className={treeLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="relative mt-1.5">
          <Icon icon="lucide:search" width={12} height={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-2 py-1 rounded bg-[var(--bg-subtle)] border border-[var(--border)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)]"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Local mode: no folder selected */}
        {local.localMode && !local.rootPath && effectiveTree.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <Icon icon="lucide:folder-open" width={32} height={32} className="text-[var(--text-disabled)]" />
            <div>
              <p className="text-[12px] text-[var(--text-secondary)] mb-1">No folder open</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Open a project folder to browse and edit files locally.</p>
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
            <Icon icon="lucide:loader-2" width={14} height={14} className="animate-spin text-[var(--brand)]" />
            Loading tree...
          </div>
        )}
        {treeError && !local.localMode && (
          <div className="px-3 py-2 text-[11px] text-[var(--color-deletions)]">{treeError}</div>
        )}
        {filteredTree.map(node =>
          node.type === 'dir'
            ? <DirItem key={node.path} dir={node} depth={0} />
            : <FileItem key={node.path} file={node as TreeFile} depth={0} />
        )}
      </div>
    </div>
  )
}
