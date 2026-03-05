'use client'

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedMode = 'light' | 'dark'
export type ThemeId = 'obsidian' | 'neon' | 'catppuccin-mocha' | 'bone' | string

export interface ThemePreset {
  id: ThemeId
  label: string
  color: string
  group: 'core' | 'tweakcn'
}

export const THEME_PRESETS: ThemePreset[] = [
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

export const RADIUS_PRESETS = [
  { id: 'sharp', label: 'Sharp', value: 0 },
  { id: 'subtle', label: 'Subtle', value: 4 },
  { id: 'default', label: 'Default', value: 8 },
  { id: 'round', label: 'Round', value: 14 },
  { id: 'pill', label: 'Pill', value: 20 },
] as const

interface ThemeContextValue {
  themeId: ThemeId
  mode: ThemeMode
  resolvedMode: ResolvedMode
  setThemeId: (id: ThemeId) => void
  setMode: (mode: ThemeMode) => void
  borderRadius: number
  setBorderRadius: (r: number) => void
  version: number
  bumpVersion: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_THEME = 'code-editor:theme'
const STORAGE_MODE = 'code-editor:mode'
const STORAGE_RADIUS = 'code-editor:border-radius'

function getSystemPreference(): ResolvedMode {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveMode(mode: ThemeMode): ResolvedMode {
  return mode === 'system' ? getSystemPreference() : mode
}

function applyToDOM(themeId: string, resolved: ResolvedMode) {
  const el = document.documentElement
  el.setAttribute('data-theme', themeId)
  if (resolved === 'dark') {
    el.classList.add('dark')
  } else {
    el.classList.remove('dark')
  }
}

function applyRadiusToDOM(base: number) {
  const el = document.documentElement
  el.style.setProperty('--radius-sm', `${Math.max(0, base - 2)}px`)
  el.style.setProperty('--radius-md', `${base}px`)
  el.style.setProperty('--radius-lg', `${Math.round(base * 1.5)}px`)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>('obsidian')
  const [mode, setModeState] = useState<ThemeMode>('dark')
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode>('dark')
  const [borderRadius, setBorderRadiusState] = useState(8)
  const [version, setVersion] = useState(0)

  const bumpVersion = useCallback(() => setVersion(v => v + 1), [])

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_THEME)
      const savedMode = localStorage.getItem(STORAGE_MODE) as ThemeMode | null
      const savedRadius = localStorage.getItem(STORAGE_RADIUS)
      const tid = savedTheme || 'obsidian'
      const md = savedMode || 'dark'
      const rm = resolveMode(md)
      const rad = savedRadius !== null ? Number(savedRadius) : 8
      setThemeIdState(tid)
      setModeState(md)
      setResolvedMode(rm)
      setBorderRadiusState(rad)
      applyToDOM(tid, rm)
      applyRadiusToDOM(rad)
    } catch {}
  }, [])

  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const rm = getSystemPreference()
      setResolvedMode(rm)
      applyToDOM(themeId, rm)
      setVersion(v => v + 1)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode, themeId])

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id)
    try { localStorage.setItem(STORAGE_THEME, id) } catch {}
    applyToDOM(id, resolvedMode)
    setVersion(v => v + 1)
  }, [resolvedMode])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    const rm = resolveMode(m)
    setResolvedMode(rm)
    try { localStorage.setItem(STORAGE_MODE, m) } catch {}
    applyToDOM(themeId, rm)
    setVersion(v => v + 1)
  }, [themeId])

  const setBorderRadius = useCallback((r: number) => {
    setBorderRadiusState(r)
    try { localStorage.setItem(STORAGE_RADIUS, String(r)) } catch {}
    applyRadiusToDOM(r)
    setVersion(v => v + 1)
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({
    themeId, mode, resolvedMode, setThemeId, setMode, borderRadius, setBorderRadius, version, bumpVersion,
  }), [themeId, mode, resolvedMode, setThemeId, setMode, borderRadius, setBorderRadius, version, bumpVersion])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
