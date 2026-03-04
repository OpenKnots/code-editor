'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'

export function SpotifyStatusBar() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setActive(!!detail?.playing)
    }
    window.addEventListener('spotify-state-changed', handler)
    return () => window.removeEventListener('spotify-state-changed', handler)
  }, [])

  if (!active) return null

  return (
    <span
      className="flex items-center gap-1 max-w-[150px] text-[var(--text-tertiary)] cursor-default"
      title="Spotify playing"
    >
      <Icon
        icon="simple-icons:spotify"
        width={9}
        height={9}
        className="text-[#1DB954]"
      />
      <span className="truncate text-[10px]">Playing</span>
    </span>
  )
}
