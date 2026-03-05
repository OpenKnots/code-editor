'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Icon } from '@iconify/react'
import {
  usePreview,
  DEVICES,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_PRESETS,
  type DeviceSpec,
} from '@/context/preview-context'
import { useEditor } from '@/context/editor-context'
import { useView } from '@/context/view-context'
import { useLocal } from '@/context/local-context'
import { isTauri, tauriInvoke } from '@/lib/tauri'
import { formatShortcut } from '@/lib/platform'
import { emit } from '@/lib/events'

/* ── Script metadata ─────────────────────────────────────────── */

interface ScriptEntry {
  name: string
  command: string
  category: 'dev' | 'build' | 'test' | 'lint' | 'other'
  icon: string
}

const SCRIPT_CATEGORIES: Record<string, { category: ScriptEntry['category']; icon: string }> = {
  dev: { category: 'dev', icon: 'lucide:play' },
  start: { category: 'dev', icon: 'lucide:play' },
  serve: { category: 'dev', icon: 'lucide:play' },
  build: { category: 'build', icon: 'lucide:hammer' },
  test: { category: 'test', icon: 'lucide:flask-conical' },
  lint: { category: 'lint', icon: 'lucide:scan-search' },
  format: { category: 'lint', icon: 'lucide:align-left' },
  typecheck: { category: 'lint', icon: 'lucide:check-circle' },
  preview: { category: 'dev', icon: 'lucide:eye' },
}

function categoriseScript(name: string): { category: ScriptEntry['category']; icon: string } {
  const lower = name.toLowerCase()
  for (const [key, meta] of Object.entries(SCRIPT_CATEGORIES)) {
    if (lower === key || lower.startsWith(`${key}:`) || lower.startsWith(`${key}-`)) return meta
  }
  if (lower.includes('dev') || lower.includes('watch'))
    return { category: 'dev', icon: 'lucide:play' }
  if (lower.includes('build') || lower.includes('compile'))
    return { category: 'build', icon: 'lucide:hammer' }
  if (lower.includes('test') || lower.includes('spec'))
    return { category: 'test', icon: 'lucide:flask-conical' }
  if (lower.includes('lint') || lower.includes('check'))
    return { category: 'lint', icon: 'lucide:scan-search' }
  return { category: 'other', icon: 'lucide:terminal' }
}

function usePackageScripts(): ScriptEntry[] {
  const { localMode, readFile } = useLocal()
  const [scripts, setScripts] = useState<ScriptEntry[]>([])

  useEffect(() => {
    if (!localMode) {
      setScripts([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const raw = await readFile('package.json')
        const pkg = JSON.parse(raw)
        if (cancelled || !pkg.scripts) return
        const entries: ScriptEntry[] = Object.entries(pkg.scripts as Record<string, string>).map(
          ([name, command]) => {
            const { category, icon } = categoriseScript(name)
            return { name, command, category, icon }
          },
        )
        setScripts(entries)
      } catch {
        if (!cancelled) setScripts([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [localMode, readFile])

  return scripts
}

function runScriptInTerminal(name: string, cwd?: string | null) {
  emit('run-script-in-terminal', { name, cwd: cwd ?? '' })
}

/* ── Preview Panel ───────────────────────────────────────────── */

export function PreviewPanel() {
  const {
    previewUrl,
    setPreviewUrl,
    visible,
    setVisible,
    pip,
    setPip,
    activeDevice,
    setActiveDevice,

    refreshKey,
    refresh,
    zoom,
    setZoom,
    panX,
    panY,
    setPan,
    resetView,
    zoomIn,
    zoomOut,
    fitToScreen,
    setFitToScreenFn,
  } = usePreview()

  const { activeFile, files } = useEditor()
  const { setView } = useView()
  const local = useLocal()
  const scripts = usePackageScripts()
  const [urlInput, setUrlInput] = useState(previewUrl)
  const [urlEditing, setUrlEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showScripts, setShowScripts] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const previewRootRef = useRef<HTMLDivElement>(null)
  const singleViewRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const device = DEVICES.find((d) => d.id === activeDevice) ?? DEVICES[0]

  const showZoomBar = device.id !== 'responsive'

  // Single-device fit-to-screen
  const fitSingleDevice = useCallback(() => {
    const container = singleViewRef.current
    if (!container || device.id === 'responsive') return
    const cw = container.clientWidth - 64
    const ch = container.clientHeight - 64
    const dw = device.width * device.scale + 40
    const dh = device.height * device.scale + 60
    const fit = Math.min(cw / dw, ch / dh, 1)
    const clamped = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit)) * 100) / 100
    setZoom(clamped)
    setPan(0, 0)
  }, [device, setZoom, setPan])

  useEffect(() => {
    if (device.id !== 'responsive') {
      setFitToScreenFn(fitSingleDevice)
      return () => setFitToScreenFn(null)
    }
  }, [device.id, fitSingleDevice, setFitToScreenFn])

  // Wheel zoom for single-device mode
  const handleSingleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (device.id === 'responsive') return
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      e.stopPropagation()

      const container = singleViewRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const cursorX = e.clientX - rect.left - rect.width / 2
      const cursorY = e.clientY - rect.top - rect.height / 2

      const delta = -e.deltaY * 0.003
      const oldZoom = zoom
      const raw = oldZoom * (1 + delta)
      const newZoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, raw)) * 100) / 100
      const ratio = newZoom / oldZoom

      setPan(cursorX - ratio * (cursorX - panX), cursorY - ratio * (cursorY - panY))
      setZoom(newZoom)
    },
    [device.id, zoom, panX, panY, setZoom, setPan],
  )

  const handleSinglePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (device.id === 'responsive') return
      if (e.button === 1 || e.button === 0) {
        e.preventDefault()
        setIsPanning(true)
        panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      }
    },
    [device.id, panX, panY],
  )

  const handleSinglePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setPan(panStartRef.current.panX + dx, panStartRef.current.panY + dy)
    },
    [isPanning, setPan],
  )

  const handleSinglePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        setIsPanning(false)
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      }
    },
    [isPanning],
  )

  // Keyboard shortcuts for single-device zoom
  useEffect(() => {
    if (device.id === 'responsive') return
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        zoomIn()
      } else if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault()
        zoomOut()
      } else if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault()
        resetView()
      } else if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault()
        fitSingleDevice()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [device.id, zoomIn, zoomOut, resetView, fitSingleDevice])

  useEffect(() => {
    setUrlInput(previewUrl)
  }, [previewUrl])

  // Fullscreen sync + escape safety
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      await (previewRootRef.current ?? document.documentElement).requestFullscreen()
    } catch {
      // ignore; browser/tauri may block fullscreen in some contexts
    }
  }, [])

  const handleUrlSubmit = () => {
    let url = urlInput.trim()
    if (url && !url.startsWith('http')) url = `http://${url}`
    setPreviewUrl(url)
    setUrlEditing(false)
  }

  const handleRunScript = useCallback(
    (name: string) => {
      runScriptInTerminal(name, local.rootPath)
      setShowScripts(false)
    },
    [local.rootPath],
  )

  const handleIframeLoad = useCallback(() => setLoading(false), [])

  useEffect(() => {
    if (previewUrl) setLoading(true)
  }, [refreshKey, previewUrl])

  useEffect(() => {
    if (!visible) setVisible(true)
  }, [visible, setVisible])

  // Reset zoom/pan when switching devices or modes
  useEffect(() => {
    resetView()
  }, [activeDevice]) // eslint-disable-line react-hooks/exhaustive-deps

  if (pip) return null

  const devScripts = scripts.filter((s) => s.category === 'dev')
  const buildScripts = scripts.filter((s) => s.category === 'build')
  const otherScripts = scripts.filter((s) => s.category !== 'dev' && s.category !== 'build')

  return (
    <div
      ref={previewRootRef}
      className="flex flex-col w-full h-full bg-[var(--bg)] overflow-hidden"
    >
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1 h-9 px-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        {/* Navigation */}
        <button
          onClick={() => iframeRef.current?.contentWindow?.history.back()}
          className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer"
          title="Back"
        >
          <Icon icon="lucide:arrow-left" width={13} height={13} />
        </button>
        <button
          onClick={() => iframeRef.current?.contentWindow?.history.forward()}
          className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer"
          title="Forward"
        >
          <Icon icon="lucide:arrow-right" width={13} height={13} />
        </button>
        <button
          onClick={refresh}
          className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer"
          title="Refresh"
        >
          <Icon
            icon={loading ? 'lucide:loader-2' : 'lucide:rotate-cw'}
            width={13}
            height={13}
            className={loading ? 'animate-spin' : ''}
          />
        </button>

        {/* URL bar */}
        <div className="flex-1 mx-1">
          {urlEditing ? (
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onBlur={handleUrlSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUrlSubmit()
                if (e.key === 'Escape') {
                  setUrlInput(previewUrl)
                  setUrlEditing(false)
                }
              }}
              autoFocus
              className="w-full px-2 py-0.5 text-[11px] font-mono rounded-md bg-[var(--bg)] border border-[var(--border-focus)] text-[var(--text-primary)] outline-none"
            />
          ) : (
            <button
              onClick={() => setUrlEditing(true)}
              className="w-full text-left px-2 py-0.5 text-[11px] font-mono rounded-md bg-[var(--bg)] border border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--border-hover)] transition-colors cursor-text truncate"
            >
              {previewUrl}
            </button>
          )}
        </div>

        {/* Scripts dropdown toggle */}
        {scripts.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowScripts(!showScripts)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                showScripts
                  ? 'bg-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[var(--brand)]'
                  : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
              title="Run scripts"
            >
              <Icon icon="lucide:terminal" width={12} height={12} />
              <Icon icon="lucide:chevron-down" width={10} height={10} />
            </button>

            {showScripts && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowScripts(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-64 max-h-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl">
                  <div className="px-3 py-2 border-b border-[var(--border)]">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
                      Scripts
                    </span>
                  </div>
                  {scripts.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => handleRunScript(s.name)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer group"
                    >
                      <Icon
                        icon={s.icon}
                        width={12}
                        height={12}
                        className="text-[var(--text-disabled)] group-hover:text-[var(--brand)] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                          {s.name}
                        </div>
                        <div className="text-[9px] font-mono text-[var(--text-disabled)] truncate">
                          {s.command}
                        </div>
                      </div>
                      <Icon
                        icon="lucide:play"
                        width={10}
                        height={10}
                        className="text-[var(--text-disabled)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Device selector */}
        <div className="flex items-center gap-0.5 px-1 border-l border-[var(--border)] ml-1">
          {DEVICES.slice(0, 4).map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveDevice(d.id)}
              className={`p-1 rounded transition-colors cursor-pointer ${
                activeDevice === d.id
                  ? 'bg-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[var(--brand)]'
                  : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
              title={d.label}
            >
              <Icon icon={d.icon} width={13} height={13} />
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 border-l border-[var(--border)] pl-1 ml-1">
          {/* PiP */}
          <button
            onClick={() => setPip(true)}
            className="p-1 rounded text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            title="Picture-in-Picture"
          >
            <Icon icon="lucide:picture-in-picture-2" width={13} height={13} />
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className={`p-1 rounded cursor-pointer ${isFullscreen ? 'text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_15%,transparent)]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'}`}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen preview'}
          >
            <Icon
              icon={isFullscreen ? 'lucide:minimize-2' : 'lucide:maximize-2'}
              width={13}
              height={13}
            />
          </button>

          {/* Open external */}
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <Icon icon="lucide:external-link" width={13} height={13} />
          </a>

          {/* Close */}
          <button
            onClick={() => {
              setVisible(false)
              setView('editor')
            }}
            className="p-1 rounded text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            title="Close preview"
          >
            <Icon icon="lucide:x" width={13} height={13} />
          </button>
        </div>
      </div>

      {/* ── Preview Area ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-full min-h-0 relative overflow-hidden">
        {/* Loading shimmer */}
        {loading && (
          <div className="absolute inset-0 z-10 bg-[var(--bg)] flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Icon
                icon="lucide:loader-2"
                width={24}
                height={24}
                className="text-[var(--brand)] animate-spin"
              />
              <span className="text-[11px] text-[var(--text-tertiary)]">Loading preview…</span>
            </div>
          </div>
        )}

        {/* Preview */}
        {device.id === 'responsive' ? (
          <div className="w-full h-full flex items-center justify-center">
            {previewUrl ? (
              <DeviceWrapper device={device}>
                <iframe
                  ref={iframeRef}
                  key={refreshKey}
                  src={previewUrl}
                  onLoad={handleIframeLoad}
                  onError={() => setLoading(false)}
                  className="w-full h-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  title="Preview"
                />
              </DeviceWrapper>
            ) : (
              <EmptyPreviewState
                onSetUrl={() => setUrlEditing(true)}
                scripts={scripts}
                devScripts={devScripts}
                buildScripts={buildScripts}
                onRunScript={handleRunScript}
              />
            )}
          </div>
        ) : (
          <div
            ref={singleViewRef}
            className="w-full h-full overflow-hidden relative"
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            onWheel={handleSingleWheel}
            onPointerDown={handleSinglePointerDown}
            onPointerMove={handleSinglePointerMove}
            onPointerUp={handleSinglePointerUp}
            onPointerCancel={handleSinglePointerUp}
          >
            <div
              className="absolute top-1/2 left-1/2"
              style={{
                transform: `translate(-50%, -50%) translate(${panX}px, ${panY}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: isPanning
                  ? 'none'
                  : 'transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                willChange: 'transform',
              }}
            >
              {previewUrl ? (
                <DeviceWrapper device={device}>
                  <iframe
                    ref={iframeRef}
                    key={refreshKey}
                    src={previewUrl}
                    onLoad={handleIframeLoad}
                    onError={() => setLoading(false)}
                    className="w-full h-full border-0 bg-white"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    title="Preview"
                  />
                </DeviceWrapper>
              ) : (
                <EmptyPreviewState
                  onSetUrl={() => setUrlEditing(true)}
                  scripts={scripts}
                  devScripts={devScripts}
                  buildScripts={buildScripts}
                  onRunScript={handleRunScript}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom zoom bar for single-device mode */}
      {showZoomBar && (
        <SingleDeviceZoomBar
          zoom={zoom}
          setZoom={setZoom}
          resetView={resetView}
          fitToScreen={fitSingleDevice}
        />
      )}
    </div>
  )
}

/* ── Device Frame Wrapper ────────────────────────────────────── */
export function DeviceWrapper({
  device,
  children,
  className = '',
}: {
  device: DeviceSpec
  children: React.ReactNode
  className?: string
}) {
  if (device.id === 'responsive') {
    return <div className={`w-full h-full ${className}`}>{children}</div>
  }

  const w = device.width * device.scale
  const h = device.height * device.scale
  const isPhone = device.id.includes('iphone') || device.id.includes('pixel')
  const isTablet = device.id.includes('ipad')
  const isLaptop = device.id.includes('macbook')

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Device label */}
      <div className="text-[9px] font-medium text-[var(--text-disabled)] uppercase tracking-wider mb-2">
        {device.label} — {device.width}×{device.height}
      </div>

      {/* Device frame */}
      <div
        className={`relative bg-[var(--bg-tertiary,var(--bg-subtle))] overflow-hidden shadow-2xl ${
          isPhone
            ? 'rounded-[28px] p-2'
            : isTablet
              ? 'rounded-[18px] p-2.5'
              : isLaptop
                ? 'rounded-t-[10px] p-1.5 pb-0'
                : 'rounded-lg p-1'
        }`}
        style={{
          width: w + (isPhone ? 16 : isTablet ? 20 : isLaptop ? 12 : 8),
          height: h + (isPhone ? 16 : isTablet ? 20 : isLaptop ? 12 : 8),
        }}
      >
        {/* Notch (iPhone) */}
        {device.id === 'iphone-15' && (
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-[80px] h-[20px] bg-[var(--bg-tertiary,var(--bg-subtle))] rounded-b-2xl z-10" />
        )}

        {/* Camera (Pixel) */}
        {device.id === 'pixel-8' && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-[var(--bg-secondary,var(--bg-elevated))] rounded-full z-10" />
        )}

        <div className="w-full h-full rounded-[inherit] overflow-hidden">
          <div
            style={{
              width: device.width,
              height: device.height,
              transform: `scale(${device.scale})`,
              transformOrigin: 'top left',
            }}
          >
            {children}
          </div>
        </div>
      </div>

      {/* Laptop base */}
      {isLaptop && (
        <div
          className="bg-[var(--bg-tertiary,var(--bg-subtle))] rounded-b-lg shadow-2xl"
          style={{ width: w + 40, height: 10 }}
        >
          <div className="mx-auto mt-0.5 w-12 h-1 bg-[var(--bg-secondary,var(--bg-elevated))] rounded-full" />
        </div>
      )}
    </div>
  )
}

/* ── Single-Device Zoom Bar ──────────────────────────────────── */

function SingleDeviceZoomBar({
  zoom,
  setZoom,
  resetView,
  fitToScreen,
}: {
  zoom: number
  setZoom: (z: number) => void
  resetView: () => void
  fitToScreen: () => void
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const zoomPercent = Math.round(zoom * 100)

  return (
    <div className="flex items-center justify-end h-7 px-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
      <div className="flex items-center gap-1">
        <button
          onClick={fitToScreen}
          className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer"
          title={`Fit to screen (${formatShortcut('meta+1')})`}
        >
          <Icon icon="lucide:scan" width={12} height={12} />
        </button>

        <button
          onClick={() => {
            const next = [...ZOOM_PRESETS].reverse().find((p) => p < zoom - 0.01)
            setZoom(next ?? Math.max(zoom - 0.1, ZOOM_MIN))
          }}
          className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={zoom <= ZOOM_MIN}
          title={`Zoom out (${formatShortcut('meta+-')})`}
        >
          <Icon icon="lucide:minus" width={12} height={12} />
        </button>

        <div className="relative w-20 h-4 flex items-center">
          <div className="absolute inset-y-0 left-0 right-0 flex items-center">
            <div className="w-full h-[3px] rounded-full bg-[var(--border)] relative">
              <div
                className="absolute h-full rounded-full bg-[var(--brand)] transition-all duration-100"
                style={{ width: `${((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100}%` }}
              />
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
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
        </div>

        <button
          onClick={() => {
            const next = ZOOM_PRESETS.find((p) => p > zoom + 0.01)
            setZoom(next ?? Math.min(zoom + 0.1, ZOOM_MAX))
          }}
          className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={zoom >= ZOOM_MAX}
          title={`Zoom in (${formatShortcut('meta+=')})`}
        >
          <Icon icon="lucide:plus" width={12} height={12} />
        </button>

        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tabular-nums text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer min-w-[44px] justify-center"
          >
            {zoomPercent}%
            <Icon
              icon="lucide:chevron-down"
              width={8}
              height={8}
              className="text-[var(--text-disabled)]"
            />
          </button>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
              <div className="absolute bottom-full right-0 mb-1 z-50 w-36 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl overflow-hidden">
                {ZOOM_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setZoom(p)
                      setDropdownOpen(false)
                    }}
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
                  onClick={() => {
                    resetView()
                    setDropdownOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:rotate-ccw" width={10} height={10} />
                  Reset (⌘0)
                </button>
                <button
                  onClick={() => {
                    fitToScreen()
                    setDropdownOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:scan" width={10} height={10} />
                  Fit to screen ({formatShortcut('meta+1')})
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface EmptyPreviewStateProps {
  onSetUrl: () => void
  scripts: ScriptEntry[]
  devScripts: ScriptEntry[]
  buildScripts: ScriptEntry[]
  onRunScript: (name: string) => void
}

function EmptyPreviewState({
  onSetUrl,
  scripts,
  devScripts,
  buildScripts,
  onRunScript,
}: EmptyPreviewStateProps) {
  const hasScripts = scripts.length > 0

  return (
    <div className="flex flex-col items-center justify-center gap-5 text-center p-8 max-w-md mx-auto">
      {/* Hero */}
      <div className="w-14 h-14 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center">
        <Icon
          icon="lucide:monitor-play"
          width={24}
          height={24}
          className="text-[var(--text-disabled)]"
        />
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-1">Live Preview</h3>
        <p className="text-[11px] text-[var(--text-tertiary)] max-w-[280px]">
          {hasScripts
            ? 'Start a dev server from your project scripts, or enter a URL manually.'
            : 'Enter a URL in the address bar to preview your app, or start a local dev server.'}
        </p>
      </div>

      {/* Dev scripts — prominent buttons */}
      {devScripts.length > 0 && (
        <div className="w-full max-w-xs space-y-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
            Dev Servers
          </span>
          <div className="flex flex-col gap-1">
            {devScripts.map((s) => (
              <button
                key={s.name}
                onClick={() => onRunScript(s.name)}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg border border-[var(--border)] hover:border-[var(--brand)] bg-[var(--bg-elevated)] hover:bg-[color-mix(in_srgb,var(--brand)_5%,transparent)] transition-all cursor-pointer group"
              >
                <div className="w-7 h-7 rounded-md bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] flex items-center justify-center shrink-0 group-hover:bg-[color-mix(in_srgb,var(--brand)_18%,transparent)] transition-colors">
                  <Icon icon="lucide:play" width={13} height={13} className="text-[var(--brand)]" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-[11px] font-semibold text-[var(--text-primary)]">
                    {s.name}
                  </div>
                  <div className="text-[9px] font-mono text-[var(--text-disabled)] truncate">
                    {s.command}
                  </div>
                </div>
                <Icon
                  icon="lucide:terminal"
                  width={11}
                  height={11}
                  className="text-[var(--text-disabled)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Build & other scripts — compact grid */}
      {(buildScripts.length > 0 || (hasScripts && devScripts.length === 0)) && (
        <div className="w-full max-w-xs space-y-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
            {devScripts.length > 0 ? 'Build & Other' : 'Scripts'}
          </span>
          <div className="grid grid-cols-2 gap-1">
            {(devScripts.length > 0
              ? [
                  ...buildScripts,
                  ...scripts.filter((s) => s.category !== 'dev' && s.category !== 'build'),
                ]
              : scripts
            ).map((s) => (
              <button
                key={s.name}
                onClick={() => onRunScript(s.name)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--border-hover)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-subtle)] transition-all cursor-pointer group text-left"
              >
                <Icon
                  icon={s.icon}
                  width={11}
                  height={11}
                  className="text-[var(--text-disabled)] group-hover:text-[var(--text-secondary)] shrink-0"
                />
                <span className="text-[10px] font-medium text-[var(--text-secondary)] truncate">
                  {s.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual URL fallback */}
      <div className="flex items-center gap-2 w-full max-w-xs">
        <div className="flex-1 h-px bg-[var(--border)]" />
        <span className="text-[9px] text-[var(--text-disabled)] uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>

      <button
        onClick={onSetUrl}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
      >
        <Icon icon="lucide:link" width={12} height={12} />
        Enter URL manually
      </button>

      {!hasScripts && (
        <div className="flex flex-col gap-1 text-[10px] text-[var(--text-disabled)]">
          <span className="font-mono">localhost:3000</span>
          <span className="font-mono">localhost:5173</span>
          <span className="font-mono">localhost:8080</span>
        </div>
      )}
    </div>
  )
}
