'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { useLayout, type PanelId } from '@/context/layout-context'
import { useView } from '@/context/view-context'
import { APP_MODES, MODE_REGISTRY, type AppMode, type ModeSpec } from '@/lib/mode-registry'

interface AppModeContextValue {
  mode: AppMode
  spec: ModeSpec
  setMode: (mode: AppMode) => void
  availableModes: AppMode[]
}

const STORAGE_KEY = 'ce:app-mode'

const AppModeContext = createContext<AppModeContextValue | null>(null)

export function AppModeProvider({ children }: { children: ReactNode }) {
  const { dispatch, setEditorCollapsed } = useLayout()
  const { activeView, setView } = useView()
  const activeViewRef = useRef(activeView)

  const [mode, setModeState] = useState<AppMode>('classic')

  useEffect(() => {
    activeViewRef.current = activeView
  }, [activeView])

  // Hydrate from localStorage after mount to avoid SSR mismatch.
  // On mobile (no saved preference), default to chat mode.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) as AppMode | null
      if (raw && raw in MODE_REGISTRY) {
        setModeState(raw)
      } else if (window.innerWidth <= 768) {
        setModeState('chat')
      }
    } catch {}
  }, [])

  const setMode = useCallback((next: AppMode) => {
    setModeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
  }, [])

  useEffect(() => {
    const spec = MODE_REGISTRY[mode]

    // Apply mode panel defaults
    for (const [panel, visible] of Object.entries(spec.panelDefaults)) {
      if (visible === undefined) continue
      dispatch({ type: 'SET_VISIBLE', panel: panel as PanelId, visible })
    }

    // Ensure active view is valid in this mode.
    // Chat mode is always chat-first, so force the chat view.
    if (mode === 'chat') {
      if (activeViewRef.current !== 'chat') {
        setView('chat')
      }
      // Force collapse (bypass editor-view guard in setEditorCollapsed).
      dispatch({ type: 'SET_EDITOR_COLLAPSED', collapsed: true })
    } else {
      if (!spec.visibleViews.includes(activeViewRef.current)) {
        setView(spec.defaultView)
      }
      setEditorCollapsed(false)
    }

    // Apply mode accent as CSS variable
    document.documentElement.style.setProperty('--mode-accent', spec.accent)
  }, [mode, dispatch, setEditorCollapsed, setView])

  const value = useMemo<AppModeContextValue>(
    () => ({
      mode,
      spec: MODE_REGISTRY[mode],
      setMode,
      availableModes: APP_MODES,
    }),
    [mode, setMode],
  )

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
}

export function useAppMode() {
  const ctx = useContext(AppModeContext)
  if (!ctx) throw new Error('useAppMode must be used within AppModeProvider')
  return ctx
}
