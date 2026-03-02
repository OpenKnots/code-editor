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

interface GitLogEntry {
  hash: string
  message: string
  author: string
  date: string
}

interface LocalContextValue {
  localMode: boolean
  rootPath: string | null
  localTree: FileEntry[]
  gitInfo: GitInfo | null
  openFolder: () => Promise<void>
  setRootPath: (path: string) => void
  exitLocalMode: () => void
  readFile: (path: string) => Promise<string>
  readFileBase64: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  refresh: () => Promise<void>
  commitFiles: (message: string, paths: string[]) => Promise<string>
  getDiff: (path: string) => Promise<string>
  unstageFiles: (paths: string[]) => Promise<void>
  undoLastCommit: () => Promise<void>
  branches: string[]
  switchBranch: (branch: string) => Promise<void>
  available: boolean
  isWebFS: boolean
  /** GitHub owner/repo parsed from git remote origin (Tauri only) */
  remoteRepo: string | null
  /** Push current branch to origin */
  push: (branch?: string) => Promise<string>
  /** Get recent git log entries */
  gitLog: (count?: number) => Promise<GitLogEntry[]>
  /** Commits ahead/behind origin */
  aheadBehind: { ahead: number; behind: number }
  /** Refresh ahead/behind count */
  refreshAheadBehind: () => Promise<void>
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
  const [localMode, setLocalMode] = useState(true)
  const [rootPath, setRootPathState] = useState<string | null>(null)
  const [localTree, setLocalTree] = useState<FileEntry[]>([])
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [desktop, setDesktop] = useState(false)
  const [remoteRepo, setRemoteRepo] = useState<string | null>(null)
  const [aheadBehind, setAheadBehind] = useState<{ ahead: number; behind: number }>({ ahead: 0, behind: 0 })

  const webDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null)

  useEffect(() => {
    const isDesktop = isTauri()
    setDesktop(isDesktop)
    setLocalMode(true)

    if (isDesktop) {
      const recent = getRecentFolders()
      if (recent.length > 0) {
        setRootPathState(recent[0])
        loadTreeTauri(recent[0])
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

        const remote = await tauriInvoke<string>('local_git_remote_url', { root })
        setRemoteRepo(remote ?? null)

        if (git.branch) {
          const ab = await tauriInvoke<[number, number]>('local_git_ahead_behind', { root, branch: git.branch })
          if (ab) setAheadBehind({ ahead: ab[0], behind: ab[1] })
          else setAheadBehind({ ahead: 0, behind: 0 })
        }
      }
    } else {
      setBranches([])
      setRemoteRepo(null)
      setAheadBehind({ ahead: 0, behind: 0 })
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
    setRootPathState(null)
    setLocalTree([])
    setGitInfo(null)
    setBranches([])
    setRemoteRepo(null)
    setAheadBehind({ ahead: 0, behind: 0 })
    webDirHandleRef.current = null
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

  const unstageFiles = useCallback(async (paths: string[]) => {
    if (!desktop || !rootPath) throw new Error('Unstage requires the desktop app')
    await tauriInvoke<string>('local_git_unstage', { root: rootPath, paths })
    await refresh()
  }, [desktop, rootPath, refresh])

  const undoLastCommit = useCallback(async () => {
    if (!desktop || !rootPath) throw new Error('Undo commit requires the desktop app')
    await tauriInvoke<string>('local_git_undo_commit', { root: rootPath })
    await refresh()
  }, [desktop, rootPath, refresh])

  const push = useCallback(async (branch?: string): Promise<string> => {
    if (!desktop || !rootPath) throw new Error('Push requires the desktop app')
    const br = branch || gitInfo?.branch
    if (!br) throw new Error('No branch to push')
    const hasUpstream = aheadBehind.ahead > 0 || aheadBehind.behind > 0
    const result = await tauriInvoke<string>('local_git_push', { root: rootPath, branch: br, setUpstream: !hasUpstream })
    await refresh()
    return result ?? 'Pushed'
  }, [desktop, rootPath, gitInfo, aheadBehind, refresh])

  const gitLog = useCallback(async (count = 20): Promise<GitLogEntry[]> => {
    if (!desktop || !rootPath) return []
    const entries = await tauriInvoke<GitLogEntry[]>('local_git_log', { root: rootPath, count })
    return entries ?? []
  }, [desktop, rootPath])

  const refreshAheadBehind = useCallback(async () => {
    if (!desktop || !rootPath || !gitInfo?.branch) return
    const ab = await tauriInvoke<[number, number]>('local_git_ahead_behind', { root: rootPath, branch: gitInfo.branch })
    if (ab) setAheadBehind({ ahead: ab[0], behind: ab[1] })
    else setAheadBehind({ ahead: 0, behind: 0 })
  }, [desktop, rootPath, gitInfo])

  const isWebFS = !desktop && localMode

  const value = useMemo<LocalContextValue>(() => ({
    localMode, rootPath, localTree, gitInfo, branches,
    available: true, isWebFS, remoteRepo, aheadBehind,
    openFolder, setRootPath, exitLocalMode,
    readFile, readFileBase64, writeFile, refresh, commitFiles, getDiff,
    unstageFiles, undoLastCommit, switchBranch, push, gitLog, refreshAheadBehind,
  }), [localMode, rootPath, localTree, gitInfo, branches, isWebFS, remoteRepo, aheadBehind,
    openFolder, setRootPath, exitLocalMode,
    readFile, readFileBase64, writeFile, refresh, commitFiles, getDiff,
    unstageFiles, undoLastCommit, switchBranch, push, gitLog, refreshAheadBehind])

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
