'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { emit } from '@/lib/events'
import { usePlugins } from '@/context/plugin-context'

const STORAGE_KEY = 'knot:youtube-playlist'
const HISTORY_KEY = 'knot:youtube-history'
const VOLUME_KEY = 'knot:youtube-volume'
const MUTED_KEY = 'knot:youtube-muted'
const MAX_HISTORY = 8

interface PlaylistInfo {
  type: 'playlist' | 'video'
  id: string
  url: string
  label: string
}

type YouTubeCommandDetail =
  | { type: 'toggle-play' }
  | { type: 'next-video' }
  | { type: 'set-volume'; value: number }
  | { type: 'toggle-mute' }
  | { type: 'show-input' }

function parseYouTubeUrl(input: string): PlaylistInfo | null {
  const trimmed = input.trim()

  // Playlist: youtube.com/playlist?list=PLxxxxx or &list=PLxxxxx
  const playlistMatch = trimmed.match(/[?&]list=([A-Za-z0-9_-]+)/)
  if (playlistMatch) {
    return {
      type: 'playlist',
      id: playlistMatch[1],
      url: trimmed,
      label: 'Playlist',
    }
  }

  // Video: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
  const videoPatterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  ]
  for (const pattern of videoPatterns) {
    const match = trimmed.match(pattern)
    if (match) {
      return {
        type: 'video',
        id: match[1],
        url: trimmed,
        label: 'Video',
      }
    }
  }

  return null
}

function buildEmbedUrl(info: PlaylistInfo): string {
  // Use youtube-nocookie.com to avoid Error 153 with non-HTTP origins (tauri://)
  const base =
    info.type === 'playlist'
      ? `https://www.youtube-nocookie.com/embed/videoseries?list=${info.id}`
      : `https://www.youtube-nocookie.com/embed/${info.id}`
  const url = new URL(base)
  url.searchParams.set('enablejsapi', '1')
  url.searchParams.set('playsinline', '1')
  url.searchParams.set('rel', '0')
  // Set origin to the localhost server for postMessage API
  url.searchParams.set('origin', `http://127.0.0.1:3080`)
  return url.toString()
}

interface HistoryEntry {
  type: PlaylistInfo['type']
  id: string
  url: string
  label: string
  addedAt: number
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)))
  } catch {}
}

const CURATED_PLAYLISTS = [
  { id: 'PLl578ZPbYIlFcSxuka8Km37VgbUYUWI5p', label: 'Lofi (Anime)', icon: 'lucide:coffee' },
  { id: 'PLp61JrZcGK7-BofsCt7bbEoF8tmus13bk', label: 'AI News', icon: 'lucide:zap' },
]

export function YouTubePlayer() {
  const { setPipPluginId } = usePlugins()
  const [input, setInput] = useState('')
  const [current, setCurrent] = useState<PlaylistInfo | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return null
  })
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [error, setError] = useState<string | null>(null)
  const [showInput, setShowInput] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(VOLUME_KEY)
      if (raw) {
        const parsed = Number(raw)
        if (Number.isFinite(parsed)) {
          return Math.max(0, Math.min(100, Math.round(parsed)))
        }
      }
    } catch {}
    return 70
  })
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MUTED_KEY) === 'true'
    } catch {
      return false
    }
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

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

  useEffect(() => {
    emit('youtube-state-changed', {
      playing: Boolean(current) && isPlaying,
      muted,
      volume,
      type: current?.type ?? '',
      id: current?.id ?? '',
      current: current
        ? {
            id: current.id,
            label: current.label,
            type: current.type,
          }
        : null,
    })
  }, [current, isPlaying, muted, volume])

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

  const sendPlayerCommand = useCallback((func: string, args: unknown[] = []) => {
    const playerWindow = iframeRef.current?.contentWindow
    if (!playerWindow) return
    playerWindow.postMessage(
      JSON.stringify({
        event: 'command',
        func,
        args,
      }),
      '*',
    )
  }, [])

  const syncPlayerVolume = useCallback(() => {
    sendPlayerCommand('setVolume', [volume])
    if (muted || volume === 0) {
      sendPlayerCommand('mute')
      return
    }
    sendPlayerCommand('unMute')
  }, [sendPlayerCommand, volume, muted])

  useEffect(() => {
    if (!current) return
    const timer = window.setTimeout(() => {
      syncPlayerVolume()
    }, 120)
    return () => window.clearTimeout(timer)
  }, [current, volume, muted, syncPlayerVolume])

  const popoutPiP = useCallback(() => {
    setPipPluginId('youtube-player')
  }, [setPipPluginId])

  const loadPlaylist = useCallback(
    (value?: string) => {
      const raw = value ?? input
      if (!raw.trim()) return

      const info = parseYouTubeUrl(raw)
      if (!info) {
        setError('Paste a YouTube playlist or video link')
        return
      }

      setError(null)
      setCurrent(info)
      setInput('')
      setShowInput(false)

      setHistory((prev) => {
        const filtered = prev.filter((h) => h.id !== info.id)
        const next: HistoryEntry[] = [
          { type: info.type, id: info.id, url: info.url, label: info.label, addedAt: Date.now() },
          ...filtered,
        ].slice(0, MAX_HISTORY)
        saveHistory(next)
        return next
      })
    },
    [input],
  )

  const playCurated = useCallback((playlist: (typeof CURATED_PLAYLISTS)[number]) => {
    const info: PlaylistInfo = {
      type: 'playlist',
      id: playlist.id,
      url: `https://www.youtube.com/playlist?list=${playlist.id}`,
      label: playlist.label,
    }
    setCurrent(info)

    setHistory((prev) => {
      const filtered = prev.filter((h) => h.id !== info.id)
      const next: HistoryEntry[] = [
        { type: info.type, id: info.id, url: info.url, label: info.label, addedAt: Date.now() },
        ...filtered,
      ].slice(0, MAX_HISTORY)
      saveHistory(next)
      return next
    })
  }, [])

  const clearCurrent = useCallback(() => {
    setCurrent(null)
  }, [])

  const handleVolumeChange = useCallback(
    (value: number) => {
      const next = Math.max(0, Math.min(100, Math.round(value)))
      setVolume(next)
      setMuted(next === 0 ? true : false)
    },
    [setVolume, setMuted],
  )

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev)
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<YouTubeCommandDetail>).detail
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
          setShowInput(true)
          window.setTimeout(() => inputRef.current?.focus(), 100)
          break
      }
    }

    window.addEventListener('youtube-command', handler)
    return () => window.removeEventListener('youtube-command', handler)
  }, [current, handleVolumeChange, isPlaying, sendPlayerCommand, toggleMute])

  const removeHistoryItem = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setHistory((prev) => {
      const next = prev.filter((h) => h.id !== id)
      saveHistory(next)
      return next
    })
  }, [])

  return (
    <div className="flex flex-col w-full h-full bg-[var(--bg)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center h-7 px-2.5 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        <Icon icon="mdi:youtube" width={14} height={14} className="text-[#FF0000] shrink-0" />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] ml-1.5">
          YouTube
        </span>
        <div className="flex-1" />
        {current && (
          <>
            <button
              onClick={popoutPiP}
              className="p-0.5 rounded cursor-pointer text-[var(--text-disabled)] hover:text-[var(--text-secondary)]"
              title="Pop out to PiP"
            >
              <Icon icon="lucide:picture-in-picture-2" width={11} height={11} />
            </button>
            <button
              onClick={() => {
                setShowInput((v) => !v)
                setTimeout(() => inputRef.current?.focus(), 100)
              }}
              className={`p-0.5 rounded cursor-pointer ${showInput ? 'text-[#FF0000]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'}`}
              title="Change playlist"
            >
              <Icon icon="lucide:replace" width={11} height={11} />
            </button>
          </>
        )}
      </div>

      {/* Paste input */}
      {(showInput || !current) && (
        <div className="border-b border-[var(--border)]">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5">
            <Icon
              icon="lucide:link"
              width={10}
              height={10}
              className="text-[var(--text-disabled)] shrink-0"
            />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadPlaylist()
                if (e.key === 'Escape') {
                  setShowInput(false)
                  setInput('')
                  setError(null)
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text')
                if (parseYouTubeUrl(text)) {
                  e.preventDefault()
                  setInput(text)
                  setTimeout(() => loadPlaylist(text), 0)
                }
              }}
              placeholder="Paste YouTube playlist link…"
              className="flex-1 bg-transparent text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
              autoFocus
              spellCheck={false}
            />
            {input && (
              <button
                onClick={() => loadPlaylist()}
                className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[#FF0000] cursor-pointer"
                title="Load"
              >
                <Icon icon="lucide:arrow-right" width={10} height={10} />
              </button>
            )}
          </div>
          {error && <p className="px-2.5 pb-1.5 text-[12px] text-[var(--error)]">{error}</p>}

          {/* Curated playlists */}
          {!current && (
            <div className="border-t border-[var(--border)]">
              <div className="px-2.5 pt-1.5 pb-1">
                <span className="text-[8px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
                  Quick play
                </span>
              </div>
              {CURATED_PLAYLISTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => playCurated(p)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--bg-subtle)] cursor-pointer text-left"
                >
                  <Icon icon={p.icon} width={10} height={10} className="text-[#FF0000] shrink-0" />
                  <span className="text-[10px] text-[var(--text-primary)] truncate">{p.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* History */}
          {!current && history.length > 0 && (
            <div className="max-h-[120px] overflow-y-auto border-t border-[var(--border)]">
              <div className="px-2.5 pt-1.5 pb-1">
                <span className="text-[8px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
                  Recent
                </span>
              </div>
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    const info: PlaylistInfo = {
                      type: h.type,
                      id: h.id,
                      url: h.url,
                      label: h.label,
                    }
                    setCurrent(info)
                    setShowInput(false)
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--bg-subtle)] cursor-pointer text-left group"
                >
                  <Icon
                    icon={h.type === 'playlist' ? 'lucide:list-music' : 'lucide:play'}
                    width={10}
                    height={10}
                    className="text-[#FF0000] shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-[var(--text-primary)] truncate">
                      {h.label} · {h.id.slice(0, 12)}…
                    </div>
                  </div>
                  <button
                    onClick={(e) => removeHistoryItem(h.id, e)}
                    className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-disabled)] opacity-0 group-hover:opacity-100 cursor-pointer"
                  >
                    <Icon icon="lucide:x" width={8} height={8} />
                  </button>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Embedded player */}
      <div className="flex-1 flex flex-col min-h-0">
        {current ? (
          <div className="flex-1 min-h-0 p-2">
            <div className="w-full h-full rounded-xl overflow-hidden bg-black/80">
              <iframe
                ref={iframeRef}
                src={buildEmbedUrl(current)}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
                title={`YouTube ${current.label}`}
                onLoad={syncPlayerVolume}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 py-8 px-3">
            <Icon
              icon="mdi:youtube"
              width={24}
              height={24}
              className="text-[var(--text-disabled)]"
            />
            <p className="text-[10px] text-[var(--text-tertiary)] text-center leading-relaxed">
              Paste a public YouTube playlist link to play music, or pick from quick play above
            </p>
            <p className="text-[8px] text-[var(--text-disabled)] text-center">No API key needed</p>
          </div>
        )}
      </div>

      {/* Footer */}
      {current && (
        <div className="flex items-center h-7 px-2.5 border-t border-[var(--border)] shrink-0 gap-1.5">
          <Icon
            icon={current.type === 'playlist' ? 'lucide:list-music' : 'lucide:play'}
            width={9}
            height={9}
            className="text-[var(--text-disabled)]"
          />
          <span className="text-[8px] text-[var(--text-disabled)] ml-1 truncate">
            {current.label}
          </span>
          <button
            onClick={toggleMute}
            className="ml-2 p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer"
            title={muted || volume === 0 ? 'Unmute' : 'Mute'}
          >
            <Icon
              icon={
                muted || volume === 0
                  ? 'lucide:volume-x'
                  : volume < 50
                    ? 'lucide:volume-1'
                    : 'lucide:volume-2'
              }
              width={10}
              height={10}
            />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            className="w-16 h-1 accent-[#FF0000] cursor-pointer"
            aria-label="YouTube volume"
          />
          <span className="text-[8px] text-[var(--text-disabled)] w-7 text-right">{volume}%</span>
          <div className="flex-1" />
          <button
            onClick={clearCurrent}
            className="text-[8px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
