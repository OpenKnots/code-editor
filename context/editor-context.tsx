'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface OpenFile {
  path: string
  content: string
  originalContent: string
  language: string
  sha?: string
  dirty: boolean
}

interface EditorContextValue {
  files: OpenFile[]
  activeFile: string | null
  setActiveFile: (path: string | null) => void
  openFile: (path: string, content: string, sha?: string) => void
  closeFile: (path: string) => void
  updateFileContent: (path: string, content: string) => void
  markClean: (path: string) => void
  getFile: (path: string) => OpenFile | undefined
}

const EditorContext = createContext<EditorContextValue | null>(null)

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', css: 'css', scss: 'scss',
    html: 'html', xml: 'xml', yaml: 'yaml', yml: 'yaml',
    py: 'python', rs: 'rust', go: 'go', rb: 'ruby',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    sql: 'sql', graphql: 'graphql', toml: 'toml',
    dockerfile: 'dockerfile', makefile: 'makefile',
  }
  return map[ext] ?? 'plaintext'
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<OpenFile[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)

  const openFile = useCallback((path: string, content: string, sha?: string) => {
    setFiles(prev => {
      const existing = prev.find(f => f.path === path)
      if (existing) return prev
      return [...prev, {
        path, content, originalContent: content,
        language: detectLanguage(path), sha, dirty: false,
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

  const markClean = useCallback((path: string) => {
    setFiles(prev => prev.map(f =>
      f.path === path ? { ...f, originalContent: f.content, dirty: false } : f
    ))
  }, [])

  const getFile = useCallback((path: string) => files.find(f => f.path === path), [files])

  return (
    <EditorContext.Provider value={{ files, activeFile, setActiveFile, openFile, closeFile, updateFileContent, markClean, getFile }}>
      {children}
    </EditorContext.Provider>
  )
}

export function useEditor() {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditor must be used within EditorProvider')
  return ctx
}
