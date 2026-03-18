'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'

export type ViewId =
  | 'chat'
  | 'editor'
  | 'preview'
  | 'planner'
  | 'diff'
  | 'git'
  | 'kanban'
  | 'skills'
  | 'prompts'
  | 'mcp'
  | 'settings'
  | 'terminal'
  | 'workshop'

const VIEW_ORDER: ViewId[] = [
  'chat',
  'editor',
  'preview',
  'planner',
  'git',
  'kanban',
  'skills',
  'prompts',
  'mcp',
  'workshop',
  'settings',
  'terminal',
]

interface ViewState {
  activeView: ViewId
  previousView: ViewId | null
  setView: (view: ViewId) => void
  goBack: () => void
  /** Transition direction for animations */
  direction: 'forward' | 'back'
}

const ViewContext = createContext<ViewState | null>(null)

export function ViewProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ViewId>('chat')
  const [previousView, setPreviousView] = useState<ViewId | null>(null)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')

  const setView = useCallback((view: ViewId) => {
    setActiveView((prev) => {
      setPreviousView(prev)
      const prevIdx = VIEW_ORDER.indexOf(prev)
      const nextIdx = VIEW_ORDER.indexOf(view)
      setDirection(nextIdx >= prevIdx ? 'forward' : 'back')
      return view
    })
  }, [])

  const goBack = useCallback(() => {
    if (previousView) {
      setDirection('back')
      setActiveView(previousView)
      setPreviousView(null)
    }
  }, [previousView])

  // Listen for view-change events (from agent, slash commands, etc.)
  useEffect(() => {
    const handler = (e: Event) => {
      const view = (e as CustomEvent).detail?.view as ViewId
      if (view) setView(view)
    }
    window.addEventListener('view-change', handler)
    return () => window.removeEventListener('view-change', handler)
  }, [setView])

  // Use a ref to avoid re-subscribing on every activeView change
  const activeViewRef = useRef(activeView)
  activeViewRef.current = activeView

  useEffect(() => {
    const handler = () => {
      if (activeViewRef.current === 'chat') setView('editor')
    }
    window.addEventListener('file-select', handler)
    return () => window.removeEventListener('file-select', handler)
  }, [setView])

  const value = useMemo<ViewState>(
    () => ({
      activeView,
      previousView,
      setView,
      goBack,
      direction,
    }),
    [activeView, previousView, setView, goBack, direction],
  )

  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>
}

export function useView() {
  const ctx = useContext(ViewContext)
  if (!ctx) throw new Error('useView must be used within ViewProvider')
  return ctx
}
