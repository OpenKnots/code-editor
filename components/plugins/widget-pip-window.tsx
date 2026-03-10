'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { usePlugins } from '@/context/plugin-context'
import { useLayout } from '@/context/layout-context'

const MIN_W = 260
const MIN_H = 200
const EDGE_SIZE = 6
const SNAP_PAD = 16

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null

const CURSOR_MAP: Record<string, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

const PLUGIN_META: Record<string, { label: string; icon: string; color: string }> = {
  'spotify-player': { label: 'Spotify', icon: 'simple-icons:spotify', color: '#1DB954' },
  'youtube-player': { label: 'YouTube', icon: 'mdi:youtube', color: '#FF0000' },
}

export function WidgetPipWindow() {
  const { pipPluginId, setPipPluginId, slots } = usePlugins()
  const layout = useLayout()

  const expandToSidebar = useCallback(() => {
    setPipPluginId(null)
    layout.show('gitPanel')
    layout.show('plugins')
  }, [setPipPluginId, layout])

  const entry = useMemo(() => {
    if (!pipPluginId) return null
    return slots.sidebar.find((e) => e.id === pipPluginId) ?? null
  }, [pipPluginId, slots.sidebar])

  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ w: 320, h: 360 })
  const [snapped, setSnapped] = useState<'br' | 'bl' | 'tr' | 'tl' | null>('br')
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 })
  const resizeRef = useRef({
    edge: null as Edge,
    startX: 0,
    startY: 0,
    startRect: { x: 0, y: 0, w: 0, h: 0 },
  })

  useEffect(() => {
    if (!snapped) return
    const x = snapped.includes('r') ? window.innerWidth - size.w - SNAP_PAD : SNAP_PAD
    const y = snapped.includes('b') ? window.innerHeight - size.h - SNAP_PAD - 28 : SNAP_PAD + 44
    setPos({ x, y })
  }, [snapped, size])

  useEffect(() => {
    if (!snapped) return
    const onResize = () => {
      const x = snapped.includes('r') ? window.innerWidth - size.w - SNAP_PAD : SNAP_PAD
      const y = snapped.includes('b') ? window.innerHeight - size.h - SNAP_PAD - 28 : SNAP_PAD + 44
      setPos({ x, y })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [snapped, size])

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      setSnapped(null)
      dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y }

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - dragRef.current.startX
        const dy = ev.clientY - dragRef.current.startY
        setPos({ x: dragRef.current.startPosX + dx, y: dragRef.current.startPosY + dy })
      }
      const onUp = (ev: MouseEvent) => {
        setIsDragging(false)
        const cx = dragRef.current.startPosX + (ev.clientX - dragRef.current.startX) + size.w / 2
        const cy = dragRef.current.startPosY + (ev.clientY - dragRef.current.startY) + size.h / 2
        const midX = window.innerWidth / 2
        const midY = window.innerHeight / 2
        const corner = `${cy < midY ? 't' : 'b'}${cx < midX ? 'l' : 'r'}` as
          | 'tl'
          | 'tr'
          | 'bl'
          | 'br'
        setSnapped(corner)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [pos, size],
  )

  const startResize = useCallback(
    (edge: Edge) => (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsResizing(true)
      setSnapped(null)
      resizeRef.current = {
        edge,
        startX: e.clientX,
        startY: e.clientY,
        startRect: { x: pos.x, y: pos.y, w: size.w, h: size.h },
      }

      const onMove = (ev: MouseEvent) => {
        const { edge: ed, startX, startY, startRect } = resizeRef.current
        if (!ed) return
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        let { x, y, w, h } = startRect

        if (ed.includes('e')) w = Math.max(MIN_W, w + dx)
        if (ed.includes('s')) h = Math.max(MIN_H, h + dy)
        if (ed.includes('w')) {
          const newW = Math.max(MIN_W, w - dx)
          x = x + (w - newW)
          w = newW
        }
        if (ed.includes('n')) {
          const newH = Math.max(MIN_H, h - dy)
          y = y + (h - newH)
          h = newH
        }

        setPos({ x, y })
        setSize({ w, h })
      }
      const onUp = () => {
        setIsResizing(false)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [pos, size],
  )

  if (!pipPluginId || !entry) return null

  const meta = PLUGIN_META[pipPluginId]
  const label = meta?.label ?? pipPluginId
  const iconName = meta?.icon ?? 'lucide:puzzle'
  const accentColor = meta?.color ?? 'var(--brand)'
  const Comp = entry.component
  const animateTransition = snapped && !isDragging && !isResizing

  return (
    <div
      ref={containerRef}
      className={`fixed z-[60] rounded-xl overflow-visible ${isDragging ? 'cursor-grabbing' : ''}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        transition: animateTransition
          ? 'left 0.3s cubic-bezier(0.16,1,0.3,1), top 0.3s cubic-bezier(0.16,1,0.3,1)'
          : 'none',
      }}
    >
      <div
        className={`w-full h-full rounded-xl overflow-hidden border border-[var(--border-hover)] transition-shadow ${
          isDragging || isResizing
            ? 'shadow-[0_20px_60px_rgba(0,0,0,0.5)]'
            : 'shadow-[0_8px_30px_rgba(0,0,0,0.3)]'
        }`}
      >
        {/* Header — drag handle */}
        <div
          onMouseDown={startDrag}
          className="flex items-center justify-between h-7 px-2 bg-[var(--bg-elevated)] border-b border-[var(--border)] cursor-grab active:cursor-grabbing shrink-0"
        >
          <div className="flex items-center gap-1.5">
            <div className="flex gap-1">
              <div
                className="w-2 h-2 rounded-full bg-[#ff5f57] cursor-pointer tauri-no-drag"
                onClick={() => setPipPluginId(null)}
                title="Close"
              />
              <div
                className="w-2 h-2 rounded-full bg-[#ffbd2e] cursor-pointer tauri-no-drag"
                onClick={() => setSnapped(snapped === 'br' ? 'tl' : 'br')}
                title="Move"
              />
              <div
                className="w-2 h-2 rounded-full bg-[#28c840] cursor-pointer tauri-no-drag"
                onClick={expandToSidebar}
                title="Expand"
              />
            </div>
            <Icon
              icon={iconName}
              width={11}
              height={11}
              style={{ color: accentColor }}
              className="ml-1"
            />
            <span className="text-[9px] text-[var(--text-disabled)] select-none">{label}</span>
          </div>
          <div className="flex items-center gap-0.5">
            {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
              <button
                key={corner}
                onClick={() => setSnapped(corner)}
                className={`w-3 h-3 rounded-sm transition-colors cursor-pointer tauri-no-drag ${
                  snapped === corner
                    ? 'bg-[var(--brand)]'
                    : 'bg-[var(--bg-subtle)] hover:bg-[var(--bg-tertiary)]'
                }`}
                title={`Snap ${corner}`}
              />
            ))}
          </div>
        </div>

        {/* Plugin content */}
        <div
          className="w-full overflow-y-auto bg-[var(--bg)]"
          style={{
            height: size.h - 28,
            pointerEvents: isDragging || isResizing ? 'none' : 'auto',
          }}
        >
          <Comp />
        </div>
      </div>

      {/* Resize edges */}
      <div
        className="absolute -top-[3px] left-[6px] right-[6px] h-[6px]"
        style={{ cursor: CURSOR_MAP.n }}
        onMouseDown={startResize('n')}
      />
      <div
        className="absolute -bottom-[3px] left-[6px] right-[6px] h-[6px]"
        style={{ cursor: CURSOR_MAP.s }}
        onMouseDown={startResize('s')}
      />
      <div
        className="absolute top-[6px] -left-[3px] bottom-[6px] w-[6px]"
        style={{ cursor: CURSOR_MAP.w }}
        onMouseDown={startResize('w')}
      />
      <div
        className="absolute top-[6px] -right-[3px] bottom-[6px] w-[6px]"
        style={{ cursor: CURSOR_MAP.e }}
        onMouseDown={startResize('e')}
      />
      <div
        className="absolute -top-[3px] -left-[3px] w-[10px] h-[10px]"
        style={{ cursor: CURSOR_MAP.nw }}
        onMouseDown={startResize('nw')}
      />
      <div
        className="absolute -top-[3px] -right-[3px] w-[10px] h-[10px]"
        style={{ cursor: CURSOR_MAP.ne }}
        onMouseDown={startResize('ne')}
      />
      <div
        className="absolute -bottom-[3px] -left-[3px] w-[10px] h-[10px]"
        style={{ cursor: CURSOR_MAP.sw }}
        onMouseDown={startResize('sw')}
      />
      <div
        className="absolute -bottom-[3px] -right-[3px] w-[10px] h-[10px]"
        style={{ cursor: CURSOR_MAP.se }}
        onMouseDown={startResize('se')}
      />
    </div>
  )
}
