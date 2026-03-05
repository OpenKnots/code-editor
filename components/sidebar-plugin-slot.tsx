'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { usePlugins } from '@/context/plugin-context'
import { useLayout, usePanelResize } from '@/context/layout-context'

const PLUGIN_META: Record<string, { label: string; icon: string; color: string }> = {
  'spotify-player': { label: 'Spotify', icon: 'simple-icons:spotify', color: '#1DB954' },
  'youtube-player': { label: 'YouTube', icon: 'mdi:youtube', color: '#FF0000' },
}

export function SidebarPluginSlot() {
  const { slots, isPluginEnabled, togglePlugin, pipPluginId, setPipPluginId } = usePlugins()
  const layout = useLayout()
  const hiddenByLayout = !layout.isVisible('plugins')
  const pluginsResize = usePanelResize('plugins')
  const pluginsWidth = layout.getSize('plugins')
  const entries = slots.sidebar
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ce:sidebar-plugins-collapsed')
      if (stored === 'true') setCollapsed(true)
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem('ce:sidebar-plugins-collapsed', String(collapsed))
    } catch {}
  }, [collapsed])

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [entries],
  )
  const enabledSorted = useMemo(
    () => sorted.filter((e) => isPluginEnabled(e.id) && e.id !== pipPluginId),
    [sorted, isPluginEnabled, pipPluginId],
  )

  const [ratios, setRatios] = useState<Record<string, number>>({})
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ce:sidebar-plugin-ratios')
      if (raw) setRatios(JSON.parse(raw))
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem('ce:sidebar-plugin-ratios', JSON.stringify(ratios))
    } catch {}
  }, [ratios])

  const containerRef = useRef<HTMLDivElement>(null)

  const handleDividerDrag = useCallback(
    (e: React.MouseEvent, topId: string, bottomId: string) => {
      e.preventDefault()
      const container = containerRef.current
      if (!container) return
      const startY = e.clientY
      const containerRect = container.getBoundingClientRect()
      const totalHeight = containerRect.height - 24

      const currentRatios = { ...ratios }
      const count = enabledSorted.length
      const defaultRatio = 1 / count
      const topRatio = currentRatios[topId] ?? defaultRatio
      const bottomRatio = currentRatios[bottomId] ?? defaultRatio

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientY - startY
        const deltaRatio = delta / totalHeight
        const newTop = Math.max(
          0.15,
          Math.min(topRatio + bottomRatio - 0.15, topRatio + deltaRatio),
        )
        const newBottom = topRatio + bottomRatio - newTop
        setRatios((prev) => ({ ...prev, [topId]: newTop, [bottomId]: newBottom }))
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [ratios, enabledSorted],
  )

  if (entries.length === 0) return null
  if (hiddenByLayout) return null

  const count = enabledSorted.length
  const defaultRatio = count > 0 ? 1 / count : 1

  return (
    <div
      className={`relative shrink-0 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden transition-[width] duration-200 ${collapsed ? 'w-[48px]' : ''}`}
      style={collapsed ? undefined : { width: pluginsWidth }}
    >
      {collapsed && (
        <div className="flex flex-col items-center pt-3 gap-2">
          {sorted.map((e) => {
            const meta = PLUGIN_META[e.id]
            const icon = meta?.icon ?? 'lucide:puzzle'
            const color = meta?.color ?? 'var(--text-secondary)'
            const enabled = isPluginEnabled(e.id)
            return (
              <button
                key={e.id}
                onClick={() => setCollapsed(false)}
                className="p-2 rounded-md hover:bg-[var(--bg-subtle)] cursor-pointer"
                title={meta?.label ?? e.id}
              >
                <Icon
                  icon={icon}
                  width={16}
                  height={16}
                  style={{ color, opacity: enabled ? 1 : 0.3 }}
                />
              </button>
            )
          })}
        </div>
      )}
      <div className={collapsed ? 'hidden' : 'flex-1 flex flex-col min-h-0 overflow-hidden'}>
        {/* Add-on toggles header */}
        <div className="shrink-0 border-b border-[var(--border)] px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              Add-ons
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {sorted.map((e) => {
              const meta = PLUGIN_META[e.id]
              const enabled = isPluginEnabled(e.id)
              return (
                <button
                  key={e.id}
                  onClick={() => togglePlugin(e.id)}
                  className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-[var(--bg-subtle)] cursor-pointer group transition-colors"
                >
                  <Icon
                    icon={meta?.icon ?? 'lucide:puzzle'}
                    width={14}
                    height={14}
                    style={{
                      color: enabled
                        ? (meta?.color ?? 'var(--text-secondary)')
                        : 'var(--text-disabled)',
                    }}
                  />
                  <span
                    className={`text-xs flex-1 text-left ${enabled ? 'text-[var(--text-secondary)]' : 'text-[var(--text-disabled)]'}`}
                  >
                    {meta?.label ?? e.id}
                  </span>
                  <div
                    className={`relative w-7 h-4 rounded-full transition-colors ${enabled ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`}
                  >
                    <div
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        <div ref={containerRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {enabledSorted.length === 0 && (
            <div className="flex-1 flex items-center justify-center p-4">
              <span className="text-xs text-[var(--text-disabled)] text-center">
                No add-ons enabled
              </span>
            </div>
          )}
          {enabledSorted.map((e, i) => {
            const C = e.component
            const ratio = ratios[e.id] ?? defaultRatio
            const meta = PLUGIN_META[e.id]
            return (
              <div key={e.id} className="flex flex-col min-h-0" style={{ flex: `${ratio} 1 0%` }}>
                {i > 0 && (
                  <div
                    className="h-[5px] shrink-0 cursor-row-resize group/divider relative z-10"
                    onMouseDown={(ev) => handleDividerDrag(ev, enabledSorted[i - 1].id, e.id)}
                  >
                    <div className="absolute inset-x-0 -top-[2px] -bottom-[2px]" />
                    <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-[2px] rounded-full bg-[var(--text-disabled)] opacity-0 group-hover/divider:opacity-30 group-hover/divider:bg-[var(--brand)] transition-all" />
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden relative group/plugin">
                  {e.id === 'youtube-player' && (
                    <button
                      onClick={() => setPipPluginId(e.id)}
                      className="absolute top-1 right-1 z-10 p-1 rounded-md bg-[var(--bg-elevated)]/80 backdrop-blur-sm text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer opacity-0 group-hover/plugin:opacity-100 transition-opacity"
                      title={`Pop out ${meta?.label ?? 'plugin'}`}
                    >
                      <Icon icon="lucide:picture-in-picture-2" width={12} height={12} />
                    </button>
                  )}
                  <C />
                </div>
              </div>
            )
          })}
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="h-6 flex items-center justify-center text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer shrink-0"
          title="Collapse"
        >
          <Icon icon="lucide:panel-right-close" width={12} height={12} />
        </button>
        <div
          className="resize-handle absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--brand)] transition-all z-10 opacity-0 hover:opacity-60 hover:w-1.5"
          onMouseDown={pluginsResize.onResizeStart}
        />
      </div>
    </div>
  )
}
