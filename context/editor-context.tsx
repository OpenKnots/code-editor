'use client'

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'

export type OpenFileKind = 'text' | 'image' | 'video' | 'audio'

export interface OpenFile {
  path: string
  content: string
  originalContent: string
  language: string
  kind: OpenFileKind
  mimeType?: string
  sha?: string
  dirty: boolean
}

interface OpenFileOptions {
  kind?: OpenFileKind
  mimeType?: string
}

interface EditorContextValue {
  files: OpenFile[]
  activeFile: string | null
  setActiveFile: (path: string | null) => void
  openFile: (path: string, content: string, sha?: string, options?: OpenFileOptions) => void
  closeFile: (path: string) => void
  updateFileContent: (path: string, content: string) => void
  markClean: (path: string, newSha?: string) => void
  reorderFiles: (fromIndex: number, toIndex: number) => void
  getFile: (path: string) => OpenFile | undefined
}

const EditorContext = createContext<EditorContextValue | null>(null)

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', mdx: 'markdown', css: 'css', scss: 'scss',
    html: 'html', xml: 'xml', yaml: 'yaml', yml: 'yaml',
    py: 'python', rs: 'rust', go: 'go', rb: 'ruby',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    sql: 'sql', graphql: 'graphql', toml: 'toml',
    dockerfile: 'dockerfile', makefile: 'makefile',
  }
  return map[ext] ?? 'plaintext'
}

function detectFileKind(path: string): OpenFileKind {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'heif', 'tif', 'tiff', 'ico'].includes(ext)) {
    return 'image'
  }
  if (['mp4', 'webm', 'ogv', 'mov', 'm4v', 'avi', 'mkv'].includes(ext)) {
    return 'video'
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) {
    return 'audio'
  }
  return 'text'
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<OpenFile[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)

  const openFile = useCallback((path: string, content: string, sha?: string, options?: OpenFileOptions) => {
    const kind = options?.kind ?? detectFileKind(path)
    const mimeType = options?.mimeType
    setFiles(prev => {
      const existing = prev.find(f => f.path === path)
      if (existing) return prev
      return [...prev, {
        path, content, originalContent: content,
        language: detectLanguage(path), kind, mimeType, sha, dirty: false,
      }]
    })
    setActiveFile(path)
  }, [])

  const closeFile = useCallback((path: string) => {
    setFiles(prev => prev.filter(f => f.path !== path))
    setActiveFile(prev => prev === path ? null : prev)
  }, [])

  const updateFileContent = useCallback((path: string, content: string) => {
    setFiles(prev => prev.map(f =>
      f.path === path ? { ...f, content, dirty: content !== f.originalContent } : f
    ))
  }, [])

  const markClean = useCallback((path: string, newSha?: string) => {
    setFiles(prev => prev.map(f =>
      f.path === path ? { ...f, originalContent: f.content, dirty: false, ...(newSha ? { sha: newSha } : {}) } : f
    ))
  }, [])

  const reorderFiles = useCallback((fromIndex: number, toIndex: number) => {
    setFiles(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }, [])

  const filesRef = useRef(files)
  filesRef.current = files

  const getFile = useCallback((path: string) => filesRef.current.find(f => f.path === path), [])

  // Persist open tab paths to localStorage
  useEffect(() => {
    try {
      const paths = files.map(f => f.path)
      localStorage.setItem('code-editor:open-tabs', JSON.stringify(paths))
      if (activeFile) localStorage.setItem('code-editor:active-tab', activeFile)
    } catch {}
  }, [files, activeFile])

  const value = useMemo<EditorContextValue>(() => ({
    files, activeFile, setActiveFile, openFile, closeFile,
    updateFileContent, markClean, reorderFiles, getFile,
  }), [files, activeFile, setActiveFile, openFile, closeFile, updateFileContent, markClean, reorderFiles, getFile])

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  )
}

export function useEditor() {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditor must be used within EditorProvider')
  return ctx
}
