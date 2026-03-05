'use client'

import { createContext, useContext, useState, useCallback, useMemo, memo, type ReactNode, type ComponentType } from 'react'

export type PluginSlot = 'status-bar-left' | 'status-bar-right' | 'floating' | 'sidebar' | 'settings'

export interface PluginEntry {
  id: string
  component: ComponentType
  order?: number
}

interface PluginState {
  slots: Record<PluginSlot, PluginEntry[]>
  registerPlugin: (slot: PluginSlot, entry: PluginEntry) => void
  unregisterPlugin: (id: string) => void
  enabledPlugins: Record<string, boolean>
  togglePlugin: (id: string) => void
  isPluginEnabled: (id: string) => boolean
  pipPluginId: string | null
  setPipPluginId: (id: string | null) => void
}

const PluginContext = createContext<PluginState | null>(null)

const EMPTY_SLOTS: Record<PluginSlot, PluginEntry[]> = {
  'status-bar-left': [],
  'status-bar-right': [],
  floating: [],
  sidebar: [],
  settings: [],
}

const STORAGE_KEY = 'ce:enabled-plugins'

function loadEnabledPlugins(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { }
  return {}
}

export function PluginProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Record<PluginSlot, PluginEntry[]>>(EMPTY_SLOTS)
  const [enabledPlugins, setEnabledPlugins] = useState<Record<string, boolean>>(loadEnabledPlugins)
  const [pipPluginId, setPipPluginId] = useState<string | null>(null)

  const registerPlugin = useCallback((slot: PluginSlot, entry: PluginEntry) => {
    setSlots(prev => {
      const existing = prev[slot]
      if (existing.some(e => e.id === entry.id)) return prev
      const next = [...existing, entry].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      return { ...prev, [slot]: next }
    })
  }, [])

  const unregisterPlugin = useCallback((id: string) => {
    setSlots(prev => {
      const next = { ...prev }
      let changed = false
      for (const slot of Object.keys(next) as PluginSlot[]) {
        const filtered = next[slot].filter(e => e.id !== id)
        if (filtered.length !== next[slot].length) {
          next[slot] = filtered
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  const togglePlugin = useCallback((id: string) => {
    setEnabledPlugins(prev => {
      const next = { ...prev, [id]: !(prev[id] ?? true) }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { }
      return next
    })
  }, [])

  const isPluginEnabled = useCallback((id: string) => {
    return enabledPlugins[id] ?? true
  }, [enabledPlugins])

  const value = useMemo<PluginState>(() => ({
    slots, registerPlugin, unregisterPlugin, enabledPlugins, togglePlugin, isPluginEnabled,
    pipPluginId, setPipPluginId,
  }), [slots, registerPlugin, unregisterPlugin, enabledPlugins, togglePlugin, isPluginEnabled, pipPluginId])

  return (
    <PluginContext.Provider value={value}>
      {children}
    </PluginContext.Provider>
  )
}

export function usePlugins() {
  const ctx = useContext(PluginContext)
  if (!ctx) throw new Error('usePlugins must be used within PluginProvider')
  return ctx
}

export const PluginSlotRenderer = memo(function PluginSlotRenderer({ slot }: { slot: PluginSlot }) {
  const { slots, isPluginEnabled } = usePlugins()
  const entries = slots[slot]
  if (entries.length === 0) return null

  const PLUGIN_GROUP_PREFIX: Record<string, string> = {
    'spotify-status-bar': 'spotify-player',
    'spotify-settings': 'spotify-player',
    'youtube-status-bar': 'youtube-player',
    'youtube-settings': 'youtube-player',
  }

  return (
    <>
      {entries.map(entry => {
        const parentId = PLUGIN_GROUP_PREFIX[entry.id]
        if (parentId && !isPluginEnabled(parentId)) return null
        const Comp = entry.component
        return <Comp key={entry.id} />
      })}
    </>
  )
})
