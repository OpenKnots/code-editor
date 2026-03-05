'use client'

import { useEffect } from 'react'
import { usePlugins } from '@/context/plugin-context'
import { YouTubePlayer } from './youtube-player'
import { YouTubeSettings } from './youtube-settings'
import { YouTubeStatusBar } from './youtube-status-bar'

export function YouTubePlugin() {
  const { registerPlugin, unregisterPlugin } = usePlugins()

  useEffect(() => {
    registerPlugin('sidebar', {
      id: 'youtube-player',
      component: YouTubePlayer,
      order: 20,
    })

    registerPlugin('status-bar-right', {
      id: 'youtube-status-bar',
      component: YouTubeStatusBar,
      order: 20,
    })

    registerPlugin('settings', {
      id: 'youtube-settings',
      component: YouTubeSettings,
      order: 20,
    })

    return () => {
      unregisterPlugin('youtube-player')
      unregisterPlugin('youtube-status-bar')
      unregisterPlugin('youtube-settings')
    }
  }, [registerPlugin, unregisterPlugin])

  return null
}
