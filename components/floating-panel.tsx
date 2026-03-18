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

  const clampBounds = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const pad = 12
      const maxW = Math.max(minW, layout.viewport.width - pad * 2)
      const maxH = Math.max(minH, layout.viewport.height - pad * 2)
      const cw = Math.min(Math.max(w, minW), maxW)
      const ch = Math.min(Math.max(h, minH), maxH)
      const cx = Math.min(Math.max(x, pad), Math.max(pad, layout.viewport.width - cw - pad))
      const cy = Math.min(Math.max(y, pad), Math.max(pad, layout.viewport.height - ch - pad))
      return { x: cx, y: cy, w: cw, h: ch }
    },
    [layout.viewport.width, layout.viewport.height, minW, minH],
  )

  const style = useMemo(
    () => ({
      left: fs.x,
      top: fs.y,
      width: fs.w,
      height: fs.h,
      zIndex: fs.z,
    }),
    [fs.x, fs.y, fs.w, fs.h, fs.z],
  )

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

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
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
    },
    [clampBounds, fs.h, fs.w, fs.x, fs.y, layout, onMouseDownBringFront, panel],
  )

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
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
    },
    [clampBounds, fs.h, fs.w, fs.x, fs.y, layout, onMouseDownBringFront, panel],
  )

  if (!fs.floating) return null

  return (
    <div
      className="group fixed flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-xl)]"
      style={style}
      onMouseDown={onMouseDownBringFront}
    >
      <div
        className="flex h-11 cursor-move select-none items-center justify-between gap-2.5 border-b border-[var(--border)] bg-[var(--bg)] px-4"
        onMouseDown={onDragStart}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon icon={icon} width={16} height={16} className="text-[var(--brand)] shrink-0" />
          <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 tauri-no-drag">
          <button
            onClick={onDock}
            className="cursor-pointer rounded-lg p-2.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
            title="Dock"
          >
            <Icon icon="lucide:pin" width={16} height={16} />
          </button>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2.5 text-[var(--text-tertiary)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)] hover:text-[var(--color-deletions)]"
            title="Close"
          >
            <Icon icon="lucide:x" width={16} height={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>

      <button
        className="absolute bottom-1.5 right-1.5 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-lg border border-transparent text-[var(--text-disabled)] opacity-0 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-secondary)] group-hover:opacity-100 tauri-no-drag"
        onMouseDown={onResizeStart}
        aria-label="Resize"
        title="Resize"
      >
        <Icon icon="lucide:chevrons-right" width={14} height={14} className="rotate-45" />
      </button>
    </div>
  )
}
