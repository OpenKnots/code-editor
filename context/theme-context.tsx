'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedMode = 'light' | 'dark'
export type ThemeId = 'obsidian' | 'neon' | 'catppuccin-mocha' | 'bone' | 'supreme' | 'claude' | string
export type EditorBgStyle = 'none' | 'grid' | 'dots' | 'gradient' | 'grid-logos'

export interface ThemePreset {
  id: ThemeId
  label: string
  color: string
  group: 'core' | 'tweakcn'
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'claude', label: 'Claude', color: '#3b82f6', group: 'core' },
  { id: 'supreme', label: 'Supreme', color: '#d2a34f', group: 'core' },
  { id: 'codex', label: 'Codex', color: '#1f1f1f', group: 'core' },
  { id: 'obsidian', label: 'Obsidian', color: '#ca3a29', group: 'core' },
  { id: 'neon', label: 'Neon', color: '#a855f7', group: 'core' },
  { id: 'catppuccin-mocha', label: 'Catppuccin', color: '#cba6f7', group: 'core' },
  { id: 'bone', label: 'Bone', color: '#78716c', group: 'core' },
  { id: 'caffeine', label: 'Caffeine', color: '#c49a5c', group: 'tweakcn' },
  { id: 'claymorphism', label: 'Claymorphism', color: '#b48ead', group: 'tweakcn' },
  { id: 'vercel', label: 'Ghost (OpenAI)', color: '#261B1C', group: 'tweakcn' },
  { id: 'vintage-paper', label: 'Vintage Paper', color: '#8b5e3c', group: 'tweakcn' },
  { id: 'voodoo', label: 'VooDoo', color: '#8b5cf6', group: 'core' },
  { id: 'cybernord', label: 'CyberNord', color: '#00ff41', group: 'tweakcn' },
  { id: 'prettypink', label: 'PrettyPink', color: '#F5A9B8', group: 'core' },
]

interface ThemeContextValue {
  themeId: ThemeId
  mode: ThemeMode
  resolvedMode: ResolvedMode
  setThemeId: (id: ThemeId) => void
  setMode: (mode: ThemeMode) => void
  bgTint: number
  setBgTint: (t: number) => void
  terminalBg: string | null
  terminalBgOpacity: number
  setTerminalBg: (url: string | null) => void
  setTerminalBgOpacity: (v: number) => void
  editorBgStyle: EditorBgStyle
  editorBgOpacity: number
  setEditorBgStyle: (s: EditorBgStyle) => void
  setEditorBgOpacity: (v: number) => void
  version: number
  bumpVersion: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_THEME = 'code-editor:theme'
const STORAGE_MODE = 'code-editor:mode'
const STORAGE_BG_TINT = 'code-editor:bg-tint'
const STORAGE_TERMINAL_BG = 'code-editor:terminal-bg'
const STORAGE_TERMINAL_BG_OPACITY = 'code-editor:terminal-bg-opacity'

const LEGACY_DEFAULT_TERMINAL_BG = '/terminal-bg-default.png'

function normalizeTerminalBg(value: string | null) {
  if (value === null || value === '' || value === LEGACY_DEFAULT_TERMINAL_BG) return null
  return value
}

function getSystemPreference(): ResolvedMode {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveMode(mode: ThemeMode): ResolvedMode {
  return mode === 'system' ? getSystemPreference() : mode
}

const EXTRA_THEMES = new Set(['caffeine', 'claymorphism', 'vercel', 'vintage-paper'])
let extraThemesLoaded = false

function ensureExtraThemes(themeId: string) {
  if (extraThemesLoaded || !EXTRA_THEMES.has(themeId)) return
  extraThemesLoaded = true
  import(/* webpackChunkName: "themes-extra" */ '@/app/themes-extra.css').catch(() => {})
}

function applyToDOM(themeId: string, resolved: ResolvedMode) {
  const el = document.documentElement
  el.setAttribute('data-theme', themeId)
  if (resolved === 'dark') {
    el.classList.add('dark')
  } else {
    el.classList.remove('dark')
  }
  ensureExtraThemes(themeId)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>('claude')
  const [mode, setModeState] = useState<ThemeMode>('dark')
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode>('dark')
  const [bgTint, setBgTintState] = useState(6)
  const [terminalBg, setTerminalBgState] = useState<string | null>(null)
  const [terminalBgOpacity, setTerminalBgOpacityState] = useState(15)
  const [editorBgStyle, setEditorBgStyleState] = useState<EditorBgStyle>('grid')
  const [editorBgOpacity, setEditorBgOpacityState] = useState(4)
  const [version, setVersion] = useState(0)

  const bumpVersion = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_THEME)
      const savedMode = localStorage.getItem(STORAGE_MODE) as ThemeMode | null
      const tid = savedTheme || 'claude'
      const md = savedMode || 'dark'
      const rm = resolveMode(md)
      const savedTint = localStorage.getItem(STORAGE_BG_TINT)
      const tint = savedTint !== null ? Number(savedTint) : 6
      const savedTermBg = localStorage.getItem(STORAGE_TERMINAL_BG)
      const savedTermBgOpacity = localStorage.getItem(STORAGE_TERMINAL_BG_OPACITY)
      setThemeIdState(tid)
      setModeState(md)
      setResolvedMode(rm)
      setBgTintState(tint)
      if (savedTermBg !== null) {
        const normalizedTermBg = normalizeTerminalBg(savedTermBg)
        setTerminalBgState(normalizedTermBg)
        if (normalizedTermBg === null && savedTermBg !== '') {
          localStorage.setItem(STORAGE_TERMINAL_BG, '')
        }
      }
      if (savedTermBgOpacity !== null) setTerminalBgOpacityState(Number(savedTermBgOpacity))
      const savedEdBg = localStorage.getItem('code-editor:editor-bg-style') as EditorBgStyle | null
      const savedEdBgOp = localStorage.getItem('code-editor:editor-bg-opacity')
      if (savedEdBg) setEditorBgStyleState(savedEdBg)
      if (savedEdBgOp !== null) setEditorBgOpacityState(Number(savedEdBgOp))
      document.documentElement.style.setProperty('--theme-bg-intensity', `${tint}%`)
      applyToDOM(tid, rm)
    } catch {}
  }, [])

  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const rm = getSystemPreference()
      setResolvedMode(rm)
      applyToDOM(themeId, rm)
      setVersion((v) => v + 1)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode, themeId])

  const setThemeId = useCallback(
    (id: ThemeId) => {
      setThemeIdState(id)
      try {
        localStorage.setItem(STORAGE_THEME, id)
      } catch {}
      applyToDOM(id, resolvedMode)
      setVersion((v) => v + 1)
    },
    [resolvedMode],
  )

  const setMode = useCallback(
    (m: ThemeMode) => {
      setModeState(m)
      const rm = resolveMode(m)
      setResolvedMode(rm)
      try {
        localStorage.setItem(STORAGE_MODE, m)
      } catch {}
      applyToDOM(themeId, rm)
      setVersion((v) => v + 1)
    },
    [themeId],
  )

  const setBgTint = useCallback((t: number) => {
    const clamped = Math.min(Math.max(t, 0), 20)
    setBgTintState(clamped)
    try {
      localStorage.setItem(STORAGE_BG_TINT, String(clamped))
    } catch {}
    document.documentElement.style.setProperty('--theme-bg-intensity', `${clamped}%`)
  }, [])

  const setTerminalBg = useCallback((url: string | null) => {
    setTerminalBgState(url)
    try {
      if (url) localStorage.setItem(STORAGE_TERMINAL_BG, url)
      else localStorage.setItem(STORAGE_TERMINAL_BG, '') // persist "no bg" so we don't revert to default
    } catch {}
  }, [])

  const setTerminalBgOpacity = useCallback((v: number) => {
    const clamped = Math.min(Math.max(v, 0), 100)
    setTerminalBgOpacityState(clamped)
    try {
      localStorage.setItem(STORAGE_TERMINAL_BG_OPACITY, String(clamped))
    } catch {}
  }, [])

  const setEditorBgStyle = useCallback((s: EditorBgStyle) => {
    setEditorBgStyleState(s)
    try { localStorage.setItem('code-editor:editor-bg-style', s) } catch {}
  }, [])

  const setEditorBgOpacity = useCallback((v: number) => {
    const clamped = Math.min(100, Math.max(0, v))
    setEditorBgOpacityState(clamped)
    try { localStorage.setItem('code-editor:editor-bg-opacity', String(clamped)) } catch {}
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      mode,
      resolvedMode,
      setThemeId,
      setMode,
      bgTint,
      setBgTint,
      terminalBg,
      terminalBgOpacity,
      setTerminalBg,
      setTerminalBgOpacity,
      editorBgStyle,
      editorBgOpacity,
      setEditorBgStyle,
      setEditorBgOpacity,
      version,
      bumpVersion,
    }),
    [
      themeId,
      mode,
      resolvedMode,
      setThemeId,
      setMode,
      bgTint,
      setBgTint,
      terminalBg,
      terminalBgOpacity,
      setTerminalBg,
      setTerminalBgOpacity,
      editorBgStyle,
      editorBgOpacity,
      setEditorBgStyle,
      setEditorBgOpacity,
      version,
      bumpVersion,
    ],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
