'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'

const STORAGE_KEY = 'knot:spotify-playlist'
const HISTORY_KEY = 'knot:spotify-history'
const MAX_HISTORY = 8

interface PlaylistInfo {
  type: 'playlist' | 'album' | 'track' | 'artist' | 'episode' | 'show'
  id: string
  url: string
  label: string
}

function parseSpotifyUrl(input: string): PlaylistInfo | null {
  const trimmed = input.trim()

  // open.spotify.com/playlist/ID, /album/ID, /track/ID, etc.
  const urlMatch = trimmed.match(
    /open\.spotify\.com\/(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]+)/
  )
  if (urlMatch) {
    return {
      type: urlMatch[1] as PlaylistInfo['type'],
      id: urlMatch[2],
      url: trimmed,
      label: `${urlMatch[1].charAt(0).toUpperCase() + urlMatch[1].slice(1)}`,
    }
  }

  // spotify:playlist:ID URI format
  const uriMatch = trimmed.match(
    /spotify:(playlist|album|track|artist|episode|show):([A-Za-z0-9]+)/
  )
  if (uriMatch) {
    return {
      type: uriMatch[1] as PlaylistInfo['type'],
      id: uriMatch[2],
      url: `https://open.spotify.com/${uriMatch[1]}/${uriMatch[2]}`,
      label: `${uriMatch[1].charAt(0).toUpperCase() + uriMatch[1].slice(1)}`,
    }
  }

  return null
}

function buildEmbedUrl(info: PlaylistInfo): string {
  return `https://open.spotify.com/embed/${info.type}/${info.id}?utm_source=generator&theme=0`
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
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY))) } catch {}
}

export function SpotifyPlayer() {
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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (current) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)) } catch {}
      window.dispatchEvent(new CustomEvent('spotify-state-changed', {
        detail: { playing: true, type: current.type, id: current.id },
      }))
    } else {
      try { localStorage.removeItem(STORAGE_KEY) } catch {}
      window.dispatchEvent(new CustomEvent('spotify-state-changed', { detail: null }))
    }
  }, [current])

  const loadPlaylist = useCallback((value?: string) => {
    const raw = value ?? input
    if (!raw.trim()) return

    const info = parseSpotifyUrl(raw)
    if (!info) {
      setError('Paste a Spotify link (playlist, album, track, etc.)')
      return
    }

    setError(null)
    setCurrent(info)
    setInput('')
    setShowInput(false)

    setHistory(prev => {
      const filtered = prev.filter(h => h.id !== info.id)
      const next: HistoryEntry[] = [
        { type: info.type, id: info.id, url: info.url, label: info.label, addedAt: Date.now() },
        ...filtered,
      ].slice(0, MAX_HISTORY)
      saveHistory(next)
      return next
    })
  }, [input])

  const clearCurrent = useCallback(() => {
    setCurrent(null)
  }, [])

  const removeHistoryItem = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setHistory(prev => {
      const next = prev.filter(h => h.id !== id)
      saveHistory(next)
      return next
    })
  }, [])

  const TYPE_ICONS: Record<string, string> = {
    playlist: 'lucide:list-music',
    album: 'lucide:disc-3',
    track: 'lucide:music',
    artist: 'lucide:mic-2',
    episode: 'lucide:podcast',
    show: 'lucide:podcast',
  }

  return (
    <div className="flex flex-col w-full h-full bg-[var(--bg)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center h-7 px-2.5 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        <Icon icon="simple-icons:spotify" width={11} height={11} className="text-[#1DB954] shrink-0" />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] ml-1.5">Music</span>
        <div className="flex-1" />
        {current && (
          <button
            onClick={() => { setShowInput(v => !v); setTimeout(() => inputRef.current?.focus(), 100) }}
            className={`p-0.5 rounded cursor-pointer ${showInput ? 'text-[#1DB954]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'}`}
            title="Change playlist"
          >
            <Icon icon="lucide:replace" width={11} height={11} />
          </button>
        )}
      </div>

      {/* Paste input */}
      {(showInput || !current) && (
        <div className="border-b border-[var(--border)]">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5">
            <Icon icon="lucide:link" width={10} height={10} className="text-[var(--text-disabled)] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => { setInput(e.target.value); setError(null) }}
              onKeyDown={e => {
                if (e.key === 'Enter') loadPlaylist()
                if (e.key === 'Escape') { setShowInput(false); setInput(''); setError(null) }
              }}
              onPaste={e => {
                const text = e.clipboardData.getData('text')
                if (parseSpotifyUrl(text)) {
                  e.preventDefault()
                  setInput(text)
                  setTimeout(() => loadPlaylist(text), 0)
                }
              }}
              placeholder="Paste Spotify link…"
              className="flex-1 bg-transparent text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
              autoFocus
              spellCheck={false}
            />
            {input && (
              <button onClick={() => loadPlaylist()} className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[#1DB954] cursor-pointer" title="Load">
                <Icon icon="lucide:arrow-right" width={10} height={10} />
              </button>
            )}
          </div>
          {error && (
            <p className="px-2.5 pb-1.5 text-[9px] text-[var(--error)]">{error}</p>
          )}

          {/* History */}
          {!current && history.length > 0 && (
            <div className="max-h-[160px] overflow-y-auto border-t border-[var(--border)]">
              <div className="px-2.5 pt-1.5 pb-1">
                <span className="text-[8px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">Recent</span>
              </div>
              {history.map(h => (
                <button
                  key={h.id}
                  onClick={() => {
                    const info: PlaylistInfo = { type: h.type, id: h.id, url: h.url, label: h.label }
                    setCurrent(info)
                    setShowInput(false)
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--bg-subtle)] cursor-pointer text-left group"
                >
                  <Icon icon={TYPE_ICONS[h.type] ?? 'lucide:music'} width={10} height={10} className="text-[#1DB954] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-[var(--text-primary)] truncate">{h.label} · {h.id}</div>
                  </div>
                  <button
                    onClick={e => removeHistoryItem(h.id, e)}
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
          <div className="flex-1 flex flex-col min-h-0">
            <iframe
              src={buildEmbedUrl(current)}
              className="flex-1 w-full border-0 rounded-none"
              style={{ minHeight: 152 }}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              title={`Spotify ${current.label}`}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 py-8 px-3">
            <Icon icon="simple-icons:spotify" width={20} height={20} className="text-[var(--text-disabled)]" />
            <p className="text-[10px] text-[var(--text-tertiary)] text-center leading-relaxed">
              Paste a public Spotify playlist, album, or track link to play music
            </p>
            <p className="text-[8px] text-[var(--text-disabled)] text-center">
              No account or API key needed
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      {current && (
        <div className="flex items-center h-6 px-2.5 border-t border-[var(--border)] shrink-0">
          <Icon icon={TYPE_ICONS[current.type] ?? 'lucide:music'} width={9} height={9} className="text-[var(--text-disabled)]" />
          <span className="text-[8px] text-[var(--text-disabled)] ml-1 truncate">{current.label}</span>
          <div className="flex-1" />
          <button onClick={clearCurrent} className="text-[8px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer">
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
