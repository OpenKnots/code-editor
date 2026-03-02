'use client'

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { isTauri, tauriInvoke } from '@/lib/tauri'

interface FileEntry {
  path: string
  name: string
  is_dir: boolean
  size?: number
}

interface GitFileStatus {
  path: string
  status: string
}

interface GitInfo {
  branch: string
  is_repo: boolean
  status: GitFileStatus[]
}

interface LocalContextValue {
  /** Whether we're in local mode (vs GitHub remote mode) */
  localMode: boolean
  /** Root folder path on disk */
  rootPath: string | null
  /** File tree from local filesystem */
  localTree: FileEntry[]
  /** Git info (branch, status) */
  gitInfo: GitInfo | null
  /** Open a folder via native dialog */
  openFolder: () => Promise<void>
  /** Set a folder directly (e.g. from recent — Tauri only) */
  setRootPath: (path: string) => void
  /** Exit local mode */
  exitLocalMode: () => void
  /** Read a local file as text */
  readFile: (path: string) => Promise<string>
  /** Read a local file as base64 */
  readFileBase64: (path: string) => Promise<string>
  /** Write a local file */
  writeFile: (path: string, content: string) => Promise<void>
  /** Refresh tree + git status */
  refresh: () => Promise<void>
  /** Commit files locally */
  commitFiles: (message: string, paths: string[]) => Promise<string>
  /** Get diff for a file */
  getDiff: (path: string) => Promise<string>
  /** Local branches */
  branches: string[]
  /** Switch to a different local branch */
  switchBranch: (branch: string) => Promise<void>
  /** Always true — local mode works via Tauri or the browser File System Access API */
  available: boolean
  /** Whether we're using the web File System Access API (vs Tauri) */
  isWebFS: boolean
}

const LocalContext = createContext<LocalContextValue | null>(null)

const STORAGE_RECENT = 'code-editor:recent-folders'
const MAX_RECENT = 5

function saveRecentFolder(path: string) {
  try {
    const recent: string[] = JSON.parse(localStorage.getItem(STORAGE_RECENT) || '[]')
    const updated = [path, ...recent.filter(p => p !== path)].slice(0, MAX_RECENT)
    localStorage.setItem(STORAGE_RECENT, JSON.stringify(updated))
  } catch {}
}

export function getRecentFolders(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_RECENT) || '[]')
  } catch { return [] }
}

// ─── Web File System Access API helpers ─────────────────────────

async function webReadTree(dirHandle: FileSystemDirectoryHandle, prefix = ''): Promise<FileEntry[]> {
  const entries: FileEntry[] = []
  for await (const [name, handle] of dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'directory') {
      entries.push({ path, name, is_dir: true })
      const subEntries = await webReadTree(handle as FileSystemDirectoryHandle, path)
      entries.push(...subEntries)
    } else {
      const file = await (handle as FileSystemFileHandle).getFile()
      entries.push({ path, name, is_dir: false, size: file.size })
    }
  }
  entries.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.path.localeCompare(b.path)
  })
  return entries
}

async function webResolveFile(
  dirHandle: FileSystemDirectoryHandle,
  filePath: string,
): Promise<FileSystemFileHandle> {
  const parts = filePath.split('/')
  let current: FileSystemDirectoryHandle = dirHandle
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i])
  }
  return current.getFileHandle(parts[parts.length - 1])
}

async function webResolveOrCreateFile(
  dirHandle: FileSystemDirectoryHandle,
  filePath: string,
): Promise<FileSystemFileHandle> {
  const parts = filePath.split('/')
  let current: FileSystemDirectoryHandle = dirHandle
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i], { create: true })
  }
  return current.getFileHandle(parts[parts.length - 1], { create: true })
}

// ─── Provider ───────────────────────────────────────────────────

export function LocalProvider({ children }: { children: ReactNode }) {
  const [localMode, setLocalMode] = useState(false)
  const [rootPath, setRootPathState] = useState<string | null>(null)
  const [localTree, setLocalTree] = useState<FileEntry[]>([])
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [desktop, setDesktop] = useState(false)

  const webDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null)

  useEffect(() => {
    const isDesktop = isTauri()
    setDesktop(isDesktop)

    if (isDesktop) {
      const recent = getRecentFolders()
      const lastMode = localStorage.getItem('code-editor:source-mode')
      if (lastMode !== 'remote' && recent.length > 0) {
        setRootPathState(recent[0])
        setLocalMode(true)
        loadTreeTauri(recent[0])
      } else if (lastMode !== 'remote') {
        setLocalMode(true)
      }
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tauri tree loader ──
  const loadTreeTauri = useCallback(async (root: string) => {
    const tree = await tauriInvoke<FileEntry[]>('local_read_tree', { root })
    if (tree) setLocalTree(tree)
    const git = await tauriInvoke<GitInfo>('local_git_info', { root })
    if (git) {
      setGitInfo(git)
      if (git.is_repo) {
        const branchList = await tauriInvoke<string[]>('local_git_branches', { root })
        if (branchList) setBranches(branchList)
      }
    } else {
      setBranches([])
    }
  }, [])

  // ── Web tree loader ──
  const loadTreeWeb = useCallback(async (handle: FileSystemDirectoryHandle) => {
    const tree = await webReadTree(handle)
    setLocalTree(tree)
    setGitInfo(null)
  }, [])

  // ── setRootPath (Tauri-only: set path by string) ──
  const setRootPath = useCallback((path: string) => {
    if (!desktop) return
    setRootPathState(path)
    setLocalMode(true)
    saveRecentFolder(path)
    localStorage.setItem('code-editor:source-mode', 'local')
    loadTreeTauri(path)
  }, [desktop, loadTreeTauri])

  // ── openFolder ──
  const openFolder = useCallback(async () => {
    if (desktop) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false, title: 'Open Folder' })
      if (selected && typeof selected === 'string') {
        setRootPath(selected)
      }
      return
    }

    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const handle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
        webDirHandleRef.current = handle
        setRootPathState(handle.name)
        setLocalMode(true)
        localStorage.setItem('code-editor:source-mode', 'local')
        await loadTreeWeb(handle)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Failed to open folder:', err)
        }
      }
    }
  }, [desktop, setRootPath, loadTreeWeb])

  const exitLocalMode = useCallback(() => {
    setLocalMode(false)
    setRootPathState(null)
    setLocalTree([])
    setGitInfo(null)
    setBranches([])
    webDirHandleRef.current = null
    localStorage.setItem('code-editor:source-mode', 'remote')
  }, [])

  const readFile = useCallback(async (path: string): Promise<string> => {
    if (desktop) {
      if (!rootPath) throw new Error('No root path')
      const content = await tauriInvoke<string>('local_read_file', { root: rootPath, path })
      return content ?? ''
    }

    const handle = webDirHandleRef.current
    if (!handle) throw new Error('No folder open')
    const fileHandle = await webResolveFile(handle, path)
    const file = await fileHandle.getFile()
    return await file.text()
  }, [desktop, rootPath])

  const readFileBase64 = useCallback(async (path: string): Promise<string> => {
    if (desktop) {
      if (!rootPath) throw new Error('No root path')
      const content = await tauriInvoke<string>('local_read_file_base64', { root: rootPath, path })
      return content ?? ''
    }

    const handle = webDirHandleRef.current
    if (!handle) throw new Error('No folder open')
    const fileHandle = await webResolveFile(handle, path)
    const file = await fileHandle.getFile()
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    const CHUNK = 8192
    const chunks: string[] = []
    for (let i = 0; i < bytes.length; i += CHUNK) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)))
    }
    return btoa(chunks.join(''))
  }, [desktop, rootPath])

  const writeFile = useCallback(async (path: string, content: string) => {
    if (desktop) {
      if (!rootPath) throw new Error('No root path')
      await tauriInvoke('local_write_file', { root: rootPath, path, content })
      return
    }

    const handle = webDirHandleRef.current
    if (!handle) throw new Error('No folder open')
    const fileHandle = await webResolveOrCreateFile(handle, path)
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
  }, [desktop, rootPath])

  const refresh = useCallback(async () => {
    if (desktop && rootPath) {
      await loadTreeTauri(rootPath)
      return
    }
    const handle = webDirHandleRef.current
    if (handle) await loadTreeWeb(handle)
  }, [desktop, rootPath, loadTreeTauri, loadTreeWeb])

  const switchBranch = useCallback(async (branch: string) => {
    if (!rootPath) return
    const result = await tauriInvoke<string>('local_git_checkout', { root: rootPath, branch })
    if (result !== null) {
      await loadTreeTauri(rootPath)
    }
  }, [rootPath, loadTreeTauri])

  const commitFiles = useCallback(async (message: string, paths: string[]): Promise<string> => {
    if (!desktop || !rootPath) throw new Error('Git commit requires the desktop app')
    const result = await tauriInvoke<string>('local_git_commit', { root: rootPath, message, paths })
    await refresh()
    return result ?? 'Committed'
  }, [desktop, rootPath, refresh])

  const getDiff = useCallback(async (path: string): Promise<string> => {
    if (!desktop || !rootPath) return ''
    const diff = await tauriInvoke<string>('local_git_diff', { root: rootPath, path })
    return diff ?? ''
  }, [desktop, rootPath])

  const isWebFS = !desktop && localMode

  const value = useMemo<LocalContextValue>(() => ({
    localMode, rootPath, localTree, gitInfo, branches,
    available: true, isWebFS,
    openFolder, setRootPath, exitLocalMode,
    readFile, readFileBase64, writeFile, refresh, commitFiles, getDiff, switchBranch,
  }), [localMode, rootPath, localTree, gitInfo, branches, isWebFS,
    openFolder, setRootPath, exitLocalMode,
    readFile, readFileBase64, writeFile, refresh, commitFiles, getDiff, switchBranch])

  return (
    <LocalContext.Provider value={value}>
      {children}
    </LocalContext.Provider>
  )
}

export function useLocal() {
  const ctx = useContext(LocalContext)
  if (!ctx) throw new Error('useLocal must be used within LocalProvider')
  return ctx
}
