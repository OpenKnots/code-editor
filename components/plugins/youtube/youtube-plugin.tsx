'use client'

import { useEffect, useRef, useState, useCallback, useMemo, useSyncExternalStore } from 'react'
import { usePlugins } from '@/context/plugin-context'
import { YouTubePlayer } from './youtube-player'
import { YouTubeSettings } from './youtube-settings'
import { YouTubeStatusBar } from './youtube-status-bar'
import { emit } from '@/lib/events'

const STORAGE_KEY = 'knot:youtube-playlist'
const VOLUME_KEY = 'knot:youtube-volume'
const MUTED_KEY = 'knot:youtube-muted'

interface PlaylistInfo {
  type: 'playlist' | 'video'
  id: string
  url: string
  label: string
}

function buildEmbedUrl(info: PlaylistInfo): string {
  const base =
    info.type === 'playlist'
      ? `https://www.youtube-nocookie.com/embed/videoseries?list=${info.id}`
      : `https://www.youtube-nocookie.com/embed/${info.id}`
  const url = new URL(base)
  url.searchParams.set('enablejsapi', '1')
  url.searchParams.set('playsinline', '1')
  url.searchParams.set('rel', '0')
  url.searchParams.set('controls', '0')
  url.searchParams.set('disablekb', '1')
  const origin =
    typeof window !== 'undefined' && window.location.protocol.startsWith('http')
      ? window.location.origin
      : 'http://127.0.0.1:3080'
  url.searchParams.set('origin', origin)
  return url.toString()
}

export interface YouTubeEngine {
  current: PlaylistInfo | null
  setCurrent: (info: PlaylistInfo | null) => void
  isPlaying: boolean
  setIsPlaying: (v: boolean | ((p: boolean) => boolean)) => void
  volume: number
  muted: boolean
  handleVolumeChange: (v: number) => void
  toggleMute: () => void
  sendPlayerCommand: (func: string, args?: unknown[]) => void
  iframeRef: React.RefObject<HTMLIFrameElement | null>
}

const fallbackIframeRef: React.RefObject<HTMLIFrameElement | null> = { current: null }
const fallbackEngine: YouTubeEngine = {
  current: null,
  setCurrent: () => {},
  isPlaying: false,
  setIsPlaying: () => {},
  volume: 70,
  muted: false,
  handleVolumeChange: () => {},
  toggleMute: () => {},
  sendPlayerCommand: () => {},
  iframeRef: fallbackIframeRef,
}

let engineSnapshot: YouTubeEngine = fallbackEngine
const engineListeners = new Set<() => void>()

function setEngineSnapshot(next: YouTubeEngine) {
  engineSnapshot = next
  engineListeners.forEach((listener) => listener())
}

export function useYouTubeEngine() {
  return useSyncExternalStore(
    (listener) => {
      engineListeners.add(listener)
      return () => engineListeners.delete(listener)
    },
    () => engineSnapshot,
    () => fallbackEngine,
  )
}

export function YouTubePlugin() {
  const { registerPlugin, unregisterPlugin } = usePlugins()

  const [current, setCurrent] = useState<PlaylistInfo | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(70)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setCurrent(JSON.parse(raw))
    } catch {}
    try {
      const rawVol = localStorage.getItem(VOLUME_KEY)
      if (rawVol) {
        const parsed = Number(rawVol)
        if (Number.isFinite(parsed)) setVolume(Math.max(0, Math.min(100, Math.round(parsed))))
      }
    } catch {}
    try {
      if (localStorage.getItem(MUTED_KEY) === 'true') setMuted(true)
    } catch {}
  }, [])

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const playerReadyRef = useRef(false)
  const pendingVolumeSync = useRef(false)

  const sendPlayerCommand = useCallback((func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
  }, [])

  const syncPlayerVolume = useCallback(() => {
    if (!playerReadyRef.current) {
      pendingVolumeSync.current = true
      return
    }
    sendPlayerCommand('setVolume', [volume])
    if (muted || volume === 0) {
      sendPlayerCommand('mute')
      return
    }
    sendPlayerCommand('unMute')
  }, [sendPlayerCommand, volume, muted])

  // Persist current to localStorage
  useEffect(() => {
    if (current) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
      } catch {}
      setIsPlaying(true)
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {}
      setIsPlaying(false)
    }
  }, [current])

  // Persist volume/muted
  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume))
    } catch {}
  }, [volume])
  useEffect(() => {
    try {
      localStorage.setItem(MUTED_KEY, String(muted))
    } catch {}
  }, [muted])

  // Emit state for status bar
  useEffect(() => {
    emit('youtube-state-changed', {
      playing: Boolean(current) && isPlaying,
      muted,
      volume,
      type: current?.type ?? '',
      id: current?.id ?? '',
      current: current ? { id: current.id, label: current.label, type: current.type } : null,
    })
  }, [current, isPlaying, muted, volume])

  // Listen for YouTube iframe API messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return
      try {
        const data = JSON.parse(event.data)
        if (data.event === 'initialDelivery' || data.event === 'onReady') {
          playerReadyRef.current = true
          if (pendingVolumeSync.current) {
            pendingVolumeSync.current = false
            syncPlayerVolume()
          }
        }
        if (data.event === 'infoDelivery' && data.info) {
          if (typeof data.info.playerState === 'number') {
            if (data.info.playerState === 1) setIsPlaying(true)
            else if (data.info.playerState === 2) setIsPlaying(false)
          }
        }
      } catch {}
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [syncPlayerVolume])

  // Sync volume when current/volume/muted changes
  useEffect(() => {
    if (!current) {
      playerReadyRef.current = false
      return
    }
    const timer = window.setTimeout(() => syncPlayerVolume(), 200)
    return () => window.clearTimeout(timer)
  }, [current, volume, muted, syncPlayerVolume])

  const handleVolumeChange = useCallback((value: number) => {
    const next = Math.max(0, Math.min(100, Math.round(value)))
    setVolume(next)
    setMuted(next === 0)
  }, [])

  const toggleMute = useCallback(() => setMuted((prev) => !prev), [])

  // Handle commands from status bar / keyboard
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail
      switch (detail?.type) {
        case 'toggle-play':
          if (!current) return
          sendPlayerCommand(isPlaying ? 'pauseVideo' : 'playVideo')
          setIsPlaying((prev) => !prev)
          break
        case 'next-video':
          if (!current) return
          sendPlayerCommand('nextVideo')
          setIsPlaying(true)
          break
        case 'set-volume':
          handleVolumeChange(detail.value)
          break
        case 'toggle-mute':
          toggleMute()
          break
        case 'show-input':
          window.dispatchEvent(new CustomEvent('youtube-show-input'))
          break
      }
    }
    window.addEventListener('youtube-command', handler)
    return () => window.removeEventListener('youtube-command', handler)
  }, [current, handleVolumeChange, isPlaying, sendPlayerCommand, toggleMute])

  useEffect(() => {
    registerPlugin('sidebar', { id: 'youtube-player', component: YouTubePlayer, order: 20 })
    registerPlugin('status-bar-right', {
      id: 'youtube-status-bar',
      component: YouTubeStatusBar,
      order: 20,
    })
    registerPlugin('settings', { id: 'youtube-settings', component: YouTubeSettings, order: 20 })
    return () => {
      unregisterPlugin('youtube-player')
      unregisterPlugin('youtube-status-bar')
      unregisterPlugin('youtube-settings')
    }
  }, [registerPlugin, unregisterPlugin])

  const engine = useMemo<YouTubeEngine>(
    () => ({
      current,
      setCurrent,
      isPlaying,
      setIsPlaying,
      volume,
      muted,
      handleVolumeChange,
      toggleMute,
      sendPlayerCommand,
      iframeRef,
    }),
    [current, isPlaying, volume, muted, handleVolumeChange, toggleMute, sendPlayerCommand],
  )

  useEffect(() => {
    setEngineSnapshot(engine)
    return () => setEngineSnapshot(fallbackEngine)
  }, [engine])

  return (
    <>
      {/* Persistent iframe — stays mounted even when sidebar/PiP is hidden */}
      {current && (
        <div
          className="fixed"
          style={{
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
            position: 'fixed',
            left: -9999,
            top: -9999,
          }}
        >
          <iframe
            ref={iframeRef}
            src={buildEmbedUrl(current)}
            className="border-0"
            style={{ width: 1, height: 1 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            loading="lazy"
            title={`YouTube ${current.label}`}
            onLoad={() => {
              const win = iframeRef.current?.contentWindow
              if (!win) return
              win.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*')
              setTimeout(syncPlayerVolume, 500)
            }}
          />
        </div>
      )}
    </>
  )
}
