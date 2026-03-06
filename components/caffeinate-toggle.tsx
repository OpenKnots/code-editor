'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'

/**
 * Caffeinate Toggle — Prevents the system from sleeping while the agent works.
 * Uses the Screen Wake Lock API (Web standard, supported in modern browsers).
 * Fallback: shows a hint to use `caffeinate` CLI on macOS.
 */
export function CaffeinateToggle({ compact = false }: { compact?: boolean }) {
  const [isActive, setIsActive] = useState(false)
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    setSupported('wakeLock' in navigator)
  }, [])

  const toggle = useCallback(async () => {
    if (isActive && wakeLock) {
      await wakeLock.release()
      setWakeLock(null)
      setIsActive(false)
    } else {
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        setWakeLock(sentinel)
        setIsActive(true)

        sentinel.addEventListener('release', () => {
          setIsActive(false)
          setWakeLock(null)
        })
      } catch (err) {
        console.warn('Wake Lock failed:', err)
      }
    }
  }, [isActive, wakeLock])

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    const handleVisibility = async () => {
      if (isActive && document.visibilityState === 'visible' && !wakeLock) {
        try {
          const sentinel = await navigator.wakeLock.request('screen')
          setWakeLock(sentinel)
        } catch {}
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [isActive, wakeLock])

  if (!supported) return null

  if (compact) {
    return (
      <button
        className={`caffeinate-compact ${isActive ? 'caffeinate-compact--active' : ''}`}
        onClick={toggle}
        title={isActive ? 'Allow sleep (caffeinate off)' : 'Prevent sleep (caffeinate on)'}
      >
        <Icon icon={isActive ? 'lucide:coffee' : 'lucide:moon'} width={14} />

        <style jsx>{`
          .caffeinate-compact {
            background: none;
            border: 1px solid var(--border);
            color: var(--text-muted);
            cursor: pointer;
            padding: 5px 8px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            transition: all 0.15s;
          }
          .caffeinate-compact:hover {
            color: var(--text-secondary);
            border-color: var(--text-muted);
          }
          .caffeinate-compact--active {
            color: #f59e0b;
            border-color: rgba(245, 158, 11, 0.3);
            background: rgba(245, 158, 11, 0.08);
          }
        `}</style>
      </button>
    )
  }

  return (
    <button className={`caffeinate ${isActive ? 'caffeinate--active' : ''}`} onClick={toggle}>
      <Icon icon={isActive ? 'lucide:coffee' : 'lucide:moon'} width={16} />
      <span>{isActive ? 'Caffeinate on' : 'Prevent sleep'}</span>
      <div className={`caffeinate__indicator ${isActive ? 'caffeinate__indicator--on' : ''}`} />

      <style jsx>{`
        .caffeinate {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s;
          width: 100%;
        }
        .caffeinate:hover {
          border-color: var(--text-muted);
        }
        .caffeinate--active {
          border-color: rgba(245, 158, 11, 0.3);
          background: rgba(245, 158, 11, 0.05);
        }
        .caffeinate__indicator {
          margin-left: auto;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-muted);
          transition: background 0.15s;
        }
        .caffeinate__indicator--on {
          background: #f59e0b;
          box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
        }
      `}</style>
    </button>
  )
}
