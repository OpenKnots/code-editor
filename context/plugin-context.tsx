'use client'

import { createContext, useContext, useState, useCallback, useMemo, memo, type ReactNode, type ComponentType } from 'react'

export type PluginSlot = 'status-bar-left' | 'status-bar-right' | 'floating' | 'settings'

export interface PluginEntry {
  id: string
  component: ComponentType
  order?: number
}

interface PluginState {
  slots: Record<PluginSlot, PluginEntry[]>
  registerPlugin: (slot: PluginSlot, entry: PluginEntry) => void
  unregisterPlugin: (id: string) => void
}

const PluginContext = createContext<PluginState | null>(null)

const EMPTY_SLOTS: Record<PluginSlot, PluginEntry[]> = {
  'status-bar-left': [],
  'status-bar-right': [],
  floating: [],
  settings: [],
}

export function PluginProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Record<PluginSlot, PluginEntry[]>>(EMPTY_SLOTS)

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

  const value = useMemo<PluginState>(() => ({
    slots, registerPlugin, unregisterPlugin,
  }), [slots, registerPlugin, unregisterPlugin])

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
  const { slots } = usePlugins()
  const entries = slots[slot]
  if (entries.length === 0) return null
  return (
    <>
      {entries.map(entry => {
        const Comp = entry.component
        return <Comp key={entry.id} />
      })}
    </>
  )
})
