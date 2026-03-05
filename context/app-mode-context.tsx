'use client'

import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
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
  const layout = useLayout()
  const { activeView, setView } = useView()

  const [mode, setModeState] = useState<AppMode>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) as AppMode | null
      if (raw && raw in MODE_REGISTRY) return raw
    } catch {}
    return 'classic'
  })

  const setMode = useCallback((next: AppMode) => {
    setModeState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
  }, [])

  useEffect(() => {
    const spec = MODE_REGISTRY[mode]

    // Apply mode panel defaults
    for (const [panel, visible] of Object.entries(spec.panelDefaults)) {
      if (visible === undefined) continue
      layout.dispatch({ type: 'SET_VISIBLE', panel: panel as PanelId, visible })
    }

    // Ensure active view is valid in this mode
    if (!spec.visibleViews.includes(activeView)) {
      setView(spec.defaultView)
    }
  }, [mode, layout, activeView, setView])

  const value = useMemo<AppModeContextValue>(() => ({
    mode,
    spec: MODE_REGISTRY[mode],
    setMode,
    availableModes: APP_MODES,
  }), [mode, setMode])

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
}

export function useAppMode() {
  const ctx = useContext(AppModeContext)
  if (!ctx) throw new Error('useAppMode must be used within AppModeProvider')
  return ctx
}
