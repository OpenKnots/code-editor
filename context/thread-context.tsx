'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'

export const THREAD_IDS = ['main', 'thread-2', 'thread-3', 'thread-4'] as const
export const MAX_THREADS = 4
export type ThreadId = (typeof THREAD_IDS)[number]

const STORAGE_ACTIVE_THREAD = 'code-editor:active-thread-id'
const CHAT_STORAGE_PREFIX = 'code-editor:chat:'

function getStoredActiveThread(): ThreadId {
  if (typeof window === 'undefined') return 'main'
  try {
    const id = localStorage.getItem(STORAGE_ACTIVE_THREAD)
    if (id && THREAD_IDS.includes(id as ThreadId)) return id as ThreadId
  } catch {}
  return 'main'
}

export interface ThreadContextValue {
  activeThreadId: ThreadId
  setActiveThreadId: (id: ThreadId) => void
  threadIds: readonly ThreadId[]
  maxThreads: number
  chatStorageKey: (threadId: ThreadId) => string
}

const ThreadContext = createContext<ThreadContextValue | null>(null)

export function ThreadProvider({ children }: { children: ReactNode }) {
  const [activeThreadId, setActiveThreadIdState] = useState<ThreadId>(getStoredActiveThread)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACTIVE_THREAD, activeThreadId)
    } catch {}
  }, [activeThreadId])

  const setActiveThreadId = useCallback((id: ThreadId) => {
    setActiveThreadIdState(id)
  }, [])

  const chatStorageKey = useCallback((threadId: ThreadId) => {
    return `${CHAT_STORAGE_PREFIX}${threadId}`
  }, [])

  const value = useMemo<ThreadContextValue>(
    () => ({
      activeThreadId,
      setActiveThreadId,
      threadIds: THREAD_IDS,
      maxThreads: MAX_THREADS,
      chatStorageKey,
    }),
    [activeThreadId, setActiveThreadId, chatStorageKey],
  )

  return <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>
}

export function useThread() {
  const ctx = useContext(ThreadContext)
  if (!ctx) throw new Error('useThread must be used within ThreadProvider')
  return ctx
}

export { CHAT_STORAGE_PREFIX }
