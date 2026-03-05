'use client'

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { usePreview, DEVICES, ZOOM_MIN, ZOOM_MAX, ZOOM_PRESETS } from '@/context/preview-context'
import { DeviceWrapper } from './preview-panel'

export function DeviceCarousel() {
  const {
    previewUrl, refreshKey, setActiveDevice, setCarouselMode,
    zoom, setZoom, panX, panY, setPan, resetView, setFitToScreenFn,
  } = usePreview()

  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [hoveredDevice, setHoveredDevice] = useState<string | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const didDragRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const lastPinchDistRef = useRef<number | null>(null)

  const carouselDevices = useMemo(
    () => DEVICES.filter(d => d.id !== 'responsive'),
    []
  )

  // Fit all devices within the viewport
  const fitAll = useCallback(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return

    const cw = container.clientWidth
    const ch = container.clientHeight
    const sw = content.scrollWidth
    const sh = content.scrollHeight

    const scaleX = (cw - 64) / sw
    const scaleY = (ch - 64) / sh
    const fit = Math.min(scaleX, scaleY, 1)
    const clamped = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit)) * 100) / 100

    setZoom(clamped)
    setPan(0, 0)
  }, [setZoom, setPan])

  useEffect(() => {
    setFitToScreenFn(fitAll)
    return () => setFitToScreenFn(null)
  }, [fitAll, setFitToScreenFn])

  // Cursor-anchored wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    e.stopPropagation()

    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const cursorX = e.clientX - rect.left - rect.width / 2
    const cursorY = e.clientY - rect.top - rect.height / 2

    const delta = -e.deltaY * 0.003
    const oldZoom = zoom
    const raw = oldZoom * (1 + delta)
    const newZoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, raw)) * 100) / 100
    const ratio = newZoom / oldZoom

    setPan(
      cursorX - ratio * (cursorX - panX),
      cursorY - ratio * (cursorY - panY),
    )
    setZoom(newZoom)
  }, [zoom, panX, panY, setZoom, setPan])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 0) {
      e.preventDefault()
      setIsPanning(true)
      didDragRef.current = false
      panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }
  }, [panX, panY])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return
    const dx = e.clientX - panStartRef.current.x
    const dy = e.clientY - panStartRef.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true
    setPan(panStartRef.current.panX + dx, panStartRef.current.panY + dy)
  }, [isPanning, setPan])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false)
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    }
  }, [isPanning])

  // Touch pinch-to-zoom
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2) {
      lastPinchDistRef.current = null
      return
    }
    e.preventDefault()

    const t0 = e.touches[0]
    const t1 = e.touches[1]
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)

    if (lastPinchDistRef.current !== null) {
      const scale = dist / lastPinchDistRef.current
      const container = containerRef.current
      if (container) {
        const rect = container.getBoundingClientRect()
        const midX = (t0.clientX + t1.clientX) / 2 - rect.left - rect.width / 2
        const midY = (t0.clientY + t1.clientY) / 2 - rect.top - rect.height / 2

        const newZoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * scale)) * 100) / 100
        const ratio = newZoom / zoom
        setPan(
          midX - ratio * (midX - panX),
          midY - ratio * (midY - panY),
        )
        setZoom(newZoom)
      }
    }
    lastPinchDistRef.current = dist
  }, [zoom, panX, panY, setZoom, setPan])

  const handleTouchEnd = useCallback(() => {
    lastPinchDistRef.current = null
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        const next = ZOOM_PRESETS.find(p => p > zoom + 0.01)
        setZoom(next ?? Math.min(zoom + 0.1, ZOOM_MAX))
      } else if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault()
        const next = [...ZOOM_PRESETS].reverse().find(p => p < zoom - 0.01)
        setZoom(next ?? Math.max(zoom - 0.1, ZOOM_MIN))
      } else if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault()
        resetView()
      } else if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault()
        fitAll()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [zoom, setZoom, resetView, fitAll])

  const selectDevice = useCallback((id: string) => {
    setActiveDevice(id as any)
    setCarouselMode(false)
  }, [setActiveDevice, setCarouselMode])

  const zoomPercent = Math.round(zoom * 100)

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={contentRef}
          className="absolute top-1/2 left-1/2 flex items-start gap-10 py-8 px-8"
          style={{
            transform: `translate(-50%, -50%) translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            willChange: 'transform',
          }}
        >
          {carouselDevices.map(device => (
            <div
              key={device.id}
              className={`shrink-0 cursor-pointer transition-all duration-200 ${
                hoveredDevice === device.id
                  ? 'ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-[var(--bg)] rounded-2xl'
                  : ''
              }`}
              onMouseEnter={() => setHoveredDevice(device.id)}
              onMouseLeave={() => setHoveredDevice(null)}
              onClick={() => !didDragRef.current && selectDevice(device.id)}
            >
              <DeviceWrapper device={device}>
                <iframe
                  key={`${device.id}-${refreshKey}`}
                  src={previewUrl}
                  className="w-full h-full border-0 bg-white pointer-events-none"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  title={`Preview — ${device.label}`}
                  loading="lazy"
                />
              </DeviceWrapper>
            </div>
          ))}
        </div>

        {/* Zoom hint overlay — only visible briefly on mount */}
        <ZoomHint />
      </div>

      {/* Bottom zoom bar */}
      <div className="flex items-center justify-between h-7 px-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        <div className="flex items-center gap-1">
          <Icon icon="lucide:layout-grid" width={12} height={12} className="text-[var(--brand)]" />
          <span className="text-[10px] font-medium text-[var(--text-secondary)]">Devices</span>
          <span className="text-[9px] text-[var(--text-disabled)] ml-1">click to focus</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Fit to screen */}
          <button
            onClick={fitAll}
            className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer"
            title="Fit to screen (⌘1)"
          >
            <Icon icon="lucide:scan" width={12} height={12} />
          </button>

          {/* Zoom out */}
          <button
            onClick={() => {
              const next = [...ZOOM_PRESETS].reverse().find(p => p < zoom - 0.01)
              setZoom(next ?? Math.max(zoom - 0.1, ZOOM_MIN))
            }}
            className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={zoom <= ZOOM_MIN}
            title="Zoom out (⌘−)"
          >
            <Icon icon="lucide:minus" width={12} height={12} />
          </button>

          {/* Zoom slider */}
          <div className="relative w-20 h-4 flex items-center group">
            <div className="absolute inset-y-0 left-0 right-0 flex items-center">
              <div className="w-full h-[3px] rounded-full bg-[var(--border)] relative">
                <div
                  className="absolute h-full rounded-full bg-[var(--brand)] transition-all duration-100"
                  style={{ width: `${((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100}%` }}
                />
                {/* 100% tick mark */}
                <div
                  className="absolute top-[-2px] w-[1px] h-[7px] bg-[var(--text-disabled)] opacity-40"
                  style={{ left: `${((1 - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100}%` }}
                />
              </div>
            </div>
            <input
              type="range"
              min={ZOOM_MIN * 100}
              max={ZOOM_MAX * 100}
              step={1}
              value={zoom * 100}
              onChange={e => setZoom(Number(e.target.value) / 100)}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
              title={`${zoomPercent}%`}
            />
          </div>

          {/* Zoom in */}
          <button
            onClick={() => {
              const next = ZOOM_PRESETS.find(p => p > zoom + 0.01)
              setZoom(next ?? Math.min(zoom + 0.1, ZOOM_MAX))
            }}
            className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={zoom >= ZOOM_MAX}
            title="Zoom in (⌘+)"
          >
            <Icon icon="lucide:plus" width={12} height={12} />
          </button>

          {/* Zoom percentage dropdown */}
          <ZoomDropdown zoom={zoom} setZoom={setZoom} resetView={resetView} fitAll={fitAll} />
        </div>
      </div>
    </div>
  )
}

function ZoomDropdown({
  zoom,
  setZoom,
  resetView,
  fitAll,
}: {
  zoom: number
  setZoom: (z: number) => void
  resetView: () => void
  fitAll: () => void
}) {
  const [open, setOpen] = useState(false)
  const zoomPercent = Math.round(zoom * 100)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tabular-nums text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer min-w-[44px] justify-center"
      >
        {zoomPercent}%
        <Icon icon="lucide:chevron-down" width={8} height={8} className="text-[var(--text-disabled)]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 mb-1 z-50 w-36 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl overflow-hidden">
            {ZOOM_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => { setZoom(p); setOpen(false) }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                  Math.abs(zoom - p) < 0.01
                    ? 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--brand)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                {Math.round(p * 100)}%
                {Math.abs(zoom - p) < 0.01 && (
                  <Icon icon="lucide:check" width={11} height={11} />
                )}
              </button>
            ))}
            <div className="border-t border-[var(--border)]" />
            <button
              onClick={() => { resetView(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
            >
              <Icon icon="lucide:rotate-ccw" width={10} height={10} />
              Reset (⌘0)
            </button>
            <button
              onClick={() => { fitAll(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
            >
              <Icon icon="lucide:scan" width={10} height={10} />
              Fit to screen (⌘1)
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ZoomHint() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-fade-out">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] shadow-lg">
        <Icon icon="lucide:mouse" width={12} height={12} className="text-[var(--text-disabled)]" />
        <span className="text-[10px] text-[var(--text-tertiary)]">
          ⌘ + scroll to zoom · drag to pan
        </span>
      </div>
    </div>
  )
}
