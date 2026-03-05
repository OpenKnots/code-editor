'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'

const STORAGE_KEY = 'knot:youtube-playlist'
const HISTORY_KEY = 'knot:youtube-history'

export function YouTubeSettings() {
  const [hasPlaylist, setHasPlaylist] = useState(false)
  const [historyCount, setHistoryCount] = useState(0)

  const refresh = useCallback(() => {
    try {
      setHasPlaylist(!!localStorage.getItem(STORAGE_KEY))
      const raw = localStorage.getItem(HISTORY_KEY)
      setHistoryCount(raw ? JSON.parse(raw).length : 0)
    } catch {}
  }, [])

  useEffect(() => {
    refresh()
    const handler = () => refresh()
    window.addEventListener('youtube-state-changed', handler)
    return () => window.removeEventListener('youtube-state-changed', handler)
  }, [refresh])

  const clearHistory = () => {
    try { localStorage.removeItem(HISTORY_KEY) } catch {}
    setHistoryCount(0)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon icon="mdi:youtube" width={14} height={14} className="text-[#FF0000]" />
        <span className="text-[11px] font-medium text-[var(--text-primary)]">YouTube</span>
      </div>

      <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
        <Icon
          icon={hasPlaylist ? 'lucide:check-circle' : 'lucide:circle-dashed'}
          width={12}
          height={12}
          className={hasPlaylist ? 'text-[var(--color-additions)] shrink-0' : 'text-[var(--text-disabled)] shrink-0'}
        />
        <span className="text-[10px] text-[var(--text-secondary)] flex-1">
          {hasPlaylist ? 'Playing now' : 'No playlist loaded'}
        </span>
      </div>

      {historyCount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {historyCount} item{historyCount !== 1 ? 's' : ''} in history
          </span>
          <button
            onClick={clearHistory}
            className="text-[9px] text-[var(--text-disabled)] hover:text-[var(--error)] transition-colors cursor-pointer"
          >
            Clear history
          </button>
        </div>
      )}

      <p className="text-[9px] text-[var(--text-disabled)]">
        Paste any YouTube video or playlist link in the sidebar player. No API key needed.
      </p>
    </div>
  )
}
