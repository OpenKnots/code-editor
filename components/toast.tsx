'use client'

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon } from '@iconify/react'

interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
  duration?: number
}

interface ToastContextValue {
  toast: (options: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const MAX_TOASTS = 3
const DEFAULT_DURATION = 4000

const ICONS = {
  info: 'lucide:info',
  success: 'lucide:check-circle',
  error: 'lucide:x-circle',
  warning: 'lucide:alert-triangle',
}

const COLORS = {
  info: 'var(--info)',
  success: 'var(--success)',
  error: 'var(--error)',
  warning: 'var(--warning)',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (options: Omit<Toast, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const newToast: Toast = { ...options, id }

      setToasts((prev) => {
        const updated = [...prev, newToast]
        // Keep only the last MAX_TOASTS
        return updated.slice(-MAX_TOASTS)
      })

      const duration = options.duration ?? DEFAULT_DURATION
      setTimeout(() => removeToast(id), duration)
    },
    [removeToast],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => {
            const duration = t.duration ?? DEFAULT_DURATION
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 100, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.8 }}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 35,
                }}
                className="pointer-events-auto flex max-w-[360px] flex-col overflow-hidden rounded-xl border shadow-[var(--shadow-xl)]"
                style={{
                  background: 'var(--bg-elevated)',
                  borderColor: 'var(--border)',
                  borderLeftWidth: '3px',
                  borderLeftColor: COLORS[t.type],
                }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <Icon
                    icon={ICONS[t.type]}
                    width={18}
                    height={18}
                    style={{ color: COLORS[t.type] }}
                    className="shrink-0"
                  />
                  <span className="text-[13px] text-[var(--text-primary)] leading-[1.4] flex-1">
                    {t.message}
                  </span>
                  <button
                    onClick={() => removeToast(t.id)}
                    className="shrink-0 p-1 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                    title="Dismiss"
                  >
                    <Icon icon="lucide:x" width={14} height={14} />
                  </button>
                </div>
                {/* Auto-dismiss progress bar */}
                <div
                  className="h-0.5 w-full"
                  style={{
                    backgroundColor: COLORS[t.type],
                    animation: `toast-progress ${duration}ms linear`,
                  }}
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
