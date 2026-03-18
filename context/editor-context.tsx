'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'

export type OpenFileKind = 'text' | 'image' | 'video' | 'audio'
export type EditorTab =
  | { id: string; type: 'file'; path: string }
  | { id: typeof PREVIEW_TAB_ID; type: 'preview' }

export const PREVIEW_TAB_ID = '__knot_preview_tab__'

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
  tabs: EditorTab[]
  activeFile: string | null
  previewTabOpen: boolean
  setActiveFile: (path: string | null) => void
  openFile: (path: string, content: string, sha?: string, options?: OpenFileOptions) => void
  closeFile: (path: string) => void
  closeFilesUnder: (dirPath: string) => void
  openPreviewTab: () => void
  closePreviewTab: () => void
  updateFileContent: (path: string, content: string) => void
  markClean: (path: string, newSha?: string) => void
  reorderFiles: (fromIndex: number, toIndex: number) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  getFile: (path: string) => OpenFile | undefined
}

const EditorContext = createContext<EditorContextValue | null>(null)

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    mdx: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    py: 'python',
    rs: 'rust',
    go: 'go',
    rb: 'ruby',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    sql: 'sql',
    graphql: 'graphql',
    toml: 'toml',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  }
  return map[ext] ?? 'plaintext'
}

export function detectFileKind(path: string): OpenFileKind {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (
    [
      'png',
      'jpg',
      'jpeg',
      'gif',
      'webp',
      'bmp',
      'svg',
      'avif',
      'heic',
      'heif',
      'tif',
      'tiff',
      'ico',
    ].includes(ext)
  ) {
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

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  opus: 'audio/opus',
}

export function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME_MAP[ext] ?? 'application/octet-stream'
}

function clampPreviewIndex(previewIndex: number, fileCount: number) {
  return Math.max(0, Math.min(previewIndex, fileCount))
}

function buildTabs(
  files: OpenFile[],
  previewTabOpen: boolean,
  previewTabIndex: number,
): EditorTab[] {
  const fileTabs: EditorTab[] = files.map((file) => ({
    id: file.path,
    type: 'file',
    path: file.path,
  }))
  if (!previewTabOpen) return fileTabs

  const next = [...fileTabs]
  next.splice(clampPreviewIndex(previewTabIndex, fileTabs.length), 0, {
    id: PREVIEW_TAB_ID,
    type: 'preview',
  })
  return next
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<OpenFile[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [previewTabOpen, setPreviewTabOpen] = useState(false)
  const [previewTabIndex, setPreviewTabIndex] = useState(0)

  const filesRef = useRef(files)
  filesRef.current = files

  const previewTabOpenRef = useRef(previewTabOpen)
  previewTabOpenRef.current = previewTabOpen

  const previewTabIndexRef = useRef(previewTabIndex)
  previewTabIndexRef.current = previewTabIndex

  const openFile = useCallback(
    (path: string, content: string, sha?: string, options?: OpenFileOptions) => {
      const kind = options?.kind ?? detectFileKind(path)
      const mimeType = options?.mimeType
      setFiles((prev) => {
        const existing = prev.find((f) => f.path === path)
        if (existing) return prev
        if (previewTabOpenRef.current && previewTabIndexRef.current >= prev.length) {
          setPreviewTabIndex((idx) => idx + 1)
        }
        return [
          ...prev,
          {
            path,
            content,
            originalContent: content,
            language: detectLanguage(path),
            kind,
            mimeType,
            sha,
            dirty: false,
          },
        ]
      })
      setActiveFile(path)
    },
    [],
  )

  const closeFile = useCallback((path: string) => {
    setFiles((prev) => {
      const removedIndex = prev.findIndex((f) => f.path === path)
      if (removedIndex === -1) return prev

      if (previewTabOpenRef.current && removedIndex < previewTabIndexRef.current) {
        setPreviewTabIndex((idx) => Math.max(0, idx - 1))
      }

      const next = prev.filter((f) => f.path !== path)
      setActiveFile((current) => {
        if (current !== path) return current
        if (next.length === 0) return null
        const fallbackIndex = Math.min(removedIndex, next.length - 1)
        return next[fallbackIndex]?.path ?? null
      })
      return next
    })
  }, [])

  const closeFilesUnder = useCallback((dirPath: string) => {
    const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/'
    setFiles((prev) => {
      const removedIndexes = prev
        .map((file, index) => ({ file, index }))
        .filter(({ file }) => file.path === dirPath || file.path.startsWith(prefix))
        .map(({ index }) => index)

      if (removedIndexes.length === 0) return prev

      const remaining = prev.filter(
        (file) => file.path !== dirPath && !file.path.startsWith(prefix),
      )
      const removedBeforePreview = removedIndexes.filter(
        (index) => index < previewTabIndexRef.current,
      ).length
      if (previewTabOpenRef.current && removedBeforePreview > 0) {
        setPreviewTabIndex((idx) => Math.max(0, idx - removedBeforePreview))
      }

      setActiveFile((current) => {
        if (current && (current === dirPath || current.startsWith(prefix))) {
          return remaining[0]?.path ?? null
        }
        return current
      })

      return remaining
    })
  }, [])

  const openPreviewTab = useCallback(() => {
    setPreviewTabOpen(true)
    setPreviewTabIndex((idx) => {
      const fileCount = filesRef.current.length
      const safeCurrent = clampPreviewIndex(idx, fileCount)
      if (!previewTabOpenRef.current) return fileCount
      return safeCurrent
    })
  }, [])

  const closePreviewTab = useCallback(() => {
    setPreviewTabOpen(false)
  }, [])

  const updateFileContent = useCallback((path: string, content: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.path === path ? { ...f, content, dirty: content !== f.originalContent } : f,
      ),
    )
  }, [])

  const markClean = useCallback((path: string, newSha?: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.path === path
          ? { ...f, originalContent: f.content, dirty: false, ...(newSha ? { sha: newSha } : {}) }
          : f,
      ),
    )
  }, [])

  const reorderFiles = useCallback((fromIndex: number, toIndex: number) => {
    setFiles((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }, [])

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    const currentFiles = filesRef.current
    const currentPreviewOpen = previewTabOpenRef.current
    const currentPreviewIndex = previewTabIndexRef.current
    const currentTabs = buildTabs(currentFiles, currentPreviewOpen, currentPreviewIndex)

    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= currentTabs.length ||
      toIndex >= currentTabs.length ||
      fromIndex === toIndex
    ) {
      return
    }

    const nextTabs = [...currentTabs]
    const [moved] = nextTabs.splice(fromIndex, 1)
    nextTabs.splice(toIndex, 0, moved)

    const nextFiles = nextTabs.filter(
      (tab): tab is Extract<EditorTab, { type: 'file' }> => tab.type === 'file',
    )
    setFiles(
      nextFiles.map((tab) => currentFiles.find((file) => file.path === tab.path)!).filter(Boolean),
    )

    const nextPreviewIndex = nextTabs.findIndex((tab) => tab.type === 'preview')
    if (nextPreviewIndex >= 0) {
      setPreviewTabOpen(true)
      setPreviewTabIndex(nextPreviewIndex)
    }
  }, [])

  const getFile = useCallback((path: string) => filesRef.current.find((f) => f.path === path), [])

  const tabs = useMemo(
    () => buildTabs(files, previewTabOpen, previewTabIndex),
    [files, previewTabOpen, previewTabIndex],
  )

  // Persist open tab paths to localStorage
  useEffect(() => {
    try {
      const paths = files.map((f) => f.path)
      localStorage.setItem('code-editor:open-tabs', JSON.stringify(paths))
      if (activeFile) localStorage.setItem('code-editor:active-tab', activeFile)
    } catch {}
  }, [files, activeFile])

  const value = useMemo<EditorContextValue>(
    () => ({
      files,
      tabs,
      activeFile,
      previewTabOpen,
      setActiveFile,
      openFile,
      closeFile,
      closeFilesUnder,
      openPreviewTab,
      closePreviewTab,
      updateFileContent,
      markClean,
      reorderFiles,
      reorderTabs,
      getFile,
    }),
    [
      files,
      tabs,
      activeFile,
      previewTabOpen,
      setActiveFile,
      openFile,
      closeFile,
      closeFilesUnder,
      openPreviewTab,
      closePreviewTab,
      updateFileContent,
      markClean,
      reorderFiles,
      reorderTabs,
      getFile,
    ],
  )

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
}

export function useEditor() {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditor must be used within EditorProvider')
  return ctx
}
