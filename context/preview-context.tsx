'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'

export type DeviceFrame =
  | 'responsive'
  | 'iphone-15'
  | 'pixel-8'
  | 'ipad-air'
  | 'macbook-14'
  | 'desktop-1080'

export interface DeviceSpec {
  id: DeviceFrame
  label: string
  width: number
  height: number
  scale: number
  bezel: boolean
  icon: string
}

export const DEVICES: DeviceSpec[] = [
  {
    id: 'responsive',
    label: 'Responsive',
    width: 0,
    height: 0,
    scale: 1,
    bezel: false,
    icon: 'lucide:maximize',
  },
  {
    id: 'iphone-15',
    label: 'iPhone 15',
    width: 393,
    height: 852,
    scale: 0.7,
    bezel: true,
    icon: 'lucide:smartphone',
  },
  {
    id: 'pixel-8',
    label: 'Pixel 8',
    width: 412,
    height: 915,
    scale: 0.7,
    bezel: true,
    icon: 'lucide:smartphone',
  },
  {
    id: 'ipad-air',
    label: 'iPad Air',
    width: 820,
    height: 1180,
    scale: 0.5,
    bezel: true,
    icon: 'lucide:tablet',
  },
  {
    id: 'macbook-14',
    label: 'MacBook 14"',
    width: 1512,
    height: 982,
    scale: 0.45,
    bezel: true,
    icon: 'lucide:laptop',
  },
  {
    id: 'desktop-1080',
    label: '1080p',
    width: 1920,
    height: 1080,
    scale: 0.4,
    bezel: false,
    icon: 'lucide:monitor',
  },
]

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 3
export const ZOOM_STEP = 0.1
export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const

interface PreviewContextValue {
  previewUrl: string
  setPreviewUrl: (url: string) => void
  visible: boolean
  setVisible: (v: boolean) => void
  pip: boolean
  setPip: (v: boolean) => void
  activeDevice: DeviceFrame
  setActiveDevice: (d: DeviceFrame) => void

  refreshKey: number
  refresh: () => void
  zoom: number
  setZoom: (z: number | ((prev: number) => number)) => void
  panX: number
  panY: number
  setPan: (x: number, y: number) => void
  resetView: () => void
  zoomIn: () => void
  zoomOut: () => void
  fitToScreen: () => void
  setFitToScreenFn: (fn: (() => void) | null) => void
}

const PreviewContext = createContext<PreviewContextValue | null>(null)

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [previewUrl, setPreviewUrl] = useState('http://localhost:3080')
  const [visible, setVisible] = useState(false)
  const [pip, setPip] = useState(false)
  const [activeDevice, setActiveDevice] = useState<DeviceFrame>('responsive')

  const [refreshKey, setRefreshKey] = useState(0)
  const [zoom, setZoomRaw] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const fitToScreenRef = useRef<(() => void) | null>(null)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const setZoom = useCallback((z: number | ((prev: number) => number)) => {
    setZoomRaw((prev) => {
      const next = typeof z === 'function' ? z(prev) : z
      return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 100) / 100
    })
  }, [])

  const setPan = useCallback((x: number, y: number) => {
    setPanX(x)
    setPanY(y)
  }, [])

  const resetView = useCallback(() => {
    setZoomRaw(1)
    setPanX(0)
    setPanY(0)
  }, [])

  const zoomIn = useCallback(() => {
    setZoom((prev) => {
      const next = ZOOM_PRESETS.find((p) => p > prev + 0.01)
      return next ?? Math.min(prev + ZOOM_STEP, ZOOM_MAX)
    })
  }, [setZoom])

  const zoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = [...ZOOM_PRESETS].reverse().find((p) => p < prev - 0.01)
      return next ?? Math.max(prev - ZOOM_STEP, ZOOM_MIN)
    })
  }, [setZoom])

  const fitToScreen = useCallback(() => {
    fitToScreenRef.current?.()
  }, [])

  const setFitToScreenFn = useCallback((fn: (() => void) | null) => {
    fitToScreenRef.current = fn
  }, [])

  const value = useMemo<PreviewContextValue>(
    () => ({
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
    }),
    [
      previewUrl,
      visible,
      pip,
      activeDevice,
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
    ],
  )

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
}

export function usePreview() {
  const ctx = useContext(PreviewContext)
  if (!ctx) throw new Error('usePreview must be used within PreviewProvider')
  return ctx
}
