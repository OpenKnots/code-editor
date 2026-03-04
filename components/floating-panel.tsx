'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useLayout, type FloatingPanelId } from '@/context/layout-context'

export function FloatingPanel({
  panel,
  title,
  icon,
  children,
  minW = 320,
  minH = 240,
  onClose,
  onDock,
}: {
  panel: FloatingPanelId
  title: string
  icon: string
  children: React.ReactNode
  minW?: number
  minH?: number
  onClose: () => void
  onDock: () => void
}) {
  const layout = useLayout()
  const fs = layout.floating(panel)
  const draggingRef = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null)
  const resizingRef = useRef<{ sx: number; sy: number; w: number; h: number } | null>(null)

  const clampBounds = useCallback((x: number, y: number, w: number, h: number) => {
    const pad = 12
    const maxW = Math.max(minW, layout.viewport.width - pad * 2)
    const maxH = Math.max(minH, layout.viewport.height - pad * 2)
    const cw = Math.min(Math.max(w, minW), maxW)
    const ch = Math.min(Math.max(h, minH), maxH)
    const cx = Math.min(Math.max(x, pad), Math.max(pad, layout.viewport.width - cw - pad))
    const cy = Math.min(Math.max(y, pad), Math.max(pad, layout.viewport.height - ch - pad))
    return { x: cx, y: cy, w: cw, h: ch }
  }, [layout.viewport.width, layout.viewport.height, minW, minH])

  const style = useMemo(() => ({
    left: fs.x,
    top: fs.y,
    width: fs.w,
    height: fs.h,
    zIndex: fs.z,
  }), [fs.x, fs.y, fs.w, fs.h, fs.z])

  // Keep bounds sane when viewport changes
  useEffect(() => {
    if (!fs.floating) return
    const next = clampBounds(fs.x, fs.y, fs.w, fs.h)
    if (next.x === fs.x && next.y === fs.y && next.w === fs.w && next.h === fs.h) return
    layout.setFloatingBounds(panel, next.x, next.y, next.w, next.h)
  }, [clampBounds, fs.floating, fs.h, fs.w, fs.x, fs.y, layout, panel])

  const onMouseDownBringFront = useCallback(() => {
    layout.bringFloatingToFront(panel)
  }, [layout, panel])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onMouseDownBringFront()
    draggingRef.current = { sx: e.clientX, sy: e.clientY, x: fs.x, y: fs.y }

    const onMove = (ev: MouseEvent) => {
      const d = draggingRef.current
      if (!d) return
      const next = clampBounds(d.x + (ev.clientX - d.sx), d.y + (ev.clientY - d.sy), fs.w, fs.h)
      layout.setFloatingBounds(panel, next.x, next.y, next.w, next.h)
    }
    const onUp = () => {
      draggingRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [clampBounds, fs.h, fs.w, fs.x, fs.y, layout, onMouseDownBringFront, panel])

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onMouseDownBringFront()
    resizingRef.current = { sx: e.clientX, sy: e.clientY, w: fs.w, h: fs.h }

    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current
      if (!r) return
      const next = clampBounds(fs.x, fs.y, r.w + (ev.clientX - r.sx), r.h + (ev.clientY - r.sy))
      layout.setFloatingBounds(panel, next.x, next.y, next.w, next.h)
    }
    const onUp = () => {
      resizingRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [clampBounds, fs.h, fs.w, fs.x, fs.y, layout, onMouseDownBringFront, panel])

  if (!fs.floating) return null

  return (
    <div
      className="fixed rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden flex flex-col"
      style={style}
      onMouseDown={onMouseDownBringFront}
    >
      <div
        className="h-10 px-3 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_80%,transparent)] cursor-move select-none"
        onMouseDown={onDragStart}
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon icon={icon} width={14} height={14} className="text-[var(--brand)] shrink-0" />
          <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1 tauri-no-drag">
          <button
            onClick={onDock}
            className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
            title="Dock"
          >
            <Icon icon="lucide:pin" width={14} height={14} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)] text-[var(--text-tertiary)] hover:text-[var(--color-deletions)] cursor-pointer"
            title="Close"
          >
            <Icon icon="lucide:x" width={14} height={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>

      <button
        className="absolute bottom-1 right-1 w-5 h-5 rounded-md cursor-nwse-resize hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] flex items-center justify-center tauri-no-drag"
        onMouseDown={onResizeStart}
        aria-label="Resize"
        title="Resize"
      >
        <Icon icon="lucide:chevrons-right" width={12} height={12} className="rotate-45" />
      </button>
    </div>
  )
}

