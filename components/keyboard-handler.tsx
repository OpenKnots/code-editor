'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useView, type ViewId } from '@/context/view-context'
import { useLayout } from '@/context/layout-context'
import { useAppMode } from '@/context/app-mode-context'
import { useEditor } from '@/context/editor-context'
import { emit } from '@/lib/events'
import type { AppMode } from '@/lib/mode-registry'

interface KeyboardHandlerProps {
  onQuickOpen: () => void
  onCommandPalette: () => void
  onGlobalSearch: () => void
  onFlashTab: (v: ViewId) => void
  saveFile: (path: string) => Promise<void>
}

export function useKeyboardShortcuts({
  onQuickOpen,
  onCommandPalette,
  onGlobalSearch,
  onFlashTab,
  saveFile,
}: KeyboardHandlerProps) {
  const { activeView, setView } = useView()
  const { mode, spec: modeSpec, setMode } = useAppMode()
  const layout = useLayout()
  const { activeFile } = useEditor()
  const visibleViews = modeSpec.visibleViews

  const activeViewRef = useRef(activeView)
  activeViewRef.current = activeView

  // ─── Main keyboard shortcut handler ────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // ⌘P — Quick open
      if (meta && e.key === 'p' && !e.shiftKey) {
        e.preventDefault()
        onQuickOpen()
      }
      // ⌘⇧P — Command palette
      if (meta && e.shiftKey && e.key === 'p') {
        e.preventDefault()
        onCommandPalette()
      }
      // ⌘⇧F — Global search
      if (meta && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        onGlobalSearch()
      }
      // ⌘\\ — Toggle sidebar
      if (meta && e.key === '\\') {
        e.preventDefault()
        layout.toggle('sidebar')
      }
      // ⌘J / ⌘` — Toggle terminal
      if (meta && (e.key === 'j' || e.key === '`') && !e.shiftKey) {
        e.preventDefault()
        layout.toggle('terminal')
      }
      // ⌘L — Open side chat panel and focus input
      if (meta && e.key === 'l' && !e.shiftKey) {
        e.preventDefault()
        if (activeViewRef.current !== 'editor') setView('editor')
        emit('open-side-chat')
        requestAnimationFrame(() => emit('focus-agent-input'))
      }
      // ⌘⌥1-4 — Focus key regions (explorer/editor/chat/terminal)
      if (meta && e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        if (activeViewRef.current !== 'editor') setView('editor')
        if (e.key === '1') {
          layout.show('tree')
          requestAnimationFrame(() => emit('focus-tree'))
        }
        if (e.key === '2') {
          requestAnimationFrame(() => emit('focus-editor'))
        }
        if (e.key === '3') {
          layout.show('chat')
          requestAnimationFrame(() => emit('focus-agent-input'))
        }
        if (e.key === '4') {
          layout.show('terminal')
          requestAnimationFrame(() => emit('focus-terminal'))
        }
      }
      // Esc — Close overlays (handled by each overlay individually via props)
      // ⌘⇧1/2/3 — Mode switching
      if (meta && e.shiftKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        const modes: AppMode[] = ['classic', 'chat', 'tui']
        const target = modes[parseInt(e.key) - 1]
        if (target) setMode(target)
        return
      }
      // ⌘1..N — View switching (mode-aware)
      if (meta && e.key >= '1' && e.key <= String(visibleViews.length)) {
        e.preventDefault()
        const target = visibleViews[parseInt(e.key) - 1]
        if (target) {
          setView(target)
          onFlashTab(target)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    setView,
    visibleViews,
    layout,
    setMode,
    onQuickOpen,
    onCommandPalette,
    onGlobalSearch,
    onFlashTab,
  ])

  // ─── ⌘S — Save file ───────────────────────────────────
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (activeFile) saveFile(activeFile)
      }
    }
    const eventHandler = (e: Event) => {
      const { path } = (e as CustomEvent).detail ?? {}
      if (path) saveFile(path)
    }
    window.addEventListener('keydown', keyHandler)
    window.addEventListener('save-file', eventHandler)
    return () => {
      window.removeEventListener('keydown', keyHandler)
      window.removeEventListener('save-file', eventHandler)
    }
  }, [activeFile, saveFile])
}
