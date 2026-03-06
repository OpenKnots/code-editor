'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { MobileConnect } from './mobile-connect'
import { SessionPresence } from './session-presence'
import { CaffeinateToggle } from './caffeinate-toggle'
import { useGateway } from '@/context/gateway-context'

type SettingsTab = 'connect' | 'general'

/**
 * Settings Panel — Gateway connection, mobile connect, device presence, and preferences.
 * Slides in from the right as a side panel overlay.
 */
export function SettingsPanel({
  open = true,
  onClose,
  initialTab,
}: {
  open?: boolean
  onClose: () => void
  initialTab?: string
}) {
  const [tab, setTab] = useState<SettingsTab>((initialTab as SettingsTab) || 'connect')
  const { status, gatewayUrl } = useGateway()

  if (!open) return null

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-panel__header">
          <h2 className="settings-panel__title">Settings</h2>
          <button className="settings-panel__close" onClick={onClose}>
            <Icon icon="lucide:x" width={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="settings-panel__tabs">
          <button
            className={`settings-panel__tab ${tab === 'connect' ? 'settings-panel__tab--active' : ''}`}
            onClick={() => setTab('connect')}
          >
            <Icon icon="lucide:smartphone" width={14} />
            Connect
          </button>
          <button
            className={`settings-panel__tab ${tab === 'general' ? 'settings-panel__tab--active' : ''}`}
            onClick={() => setTab('general')}
          >
            <Icon icon="lucide:sliders-horizontal" width={14} />
            General
          </button>
        </div>

        {/* Content */}
        <div className="settings-panel__content">
          {tab === 'connect' && (
            <div className="settings-panel__section">
              {/* Mobile Connect with QR */}
              <MobileConnect />

              {/* Divider */}
              <div className="settings-panel__divider" />

              {/* Connected Devices */}
              <SessionPresence />

              {/* Divider */}
              <div className="settings-panel__divider" />

              {/* Gateway Info */}
              <div className="settings-panel__info">
                <div className="settings-panel__info-row">
                  <span className="settings-panel__info-label">Status</span>
                  <span
                    className={`settings-panel__info-value settings-panel__info-value--${status}`}
                  >
                    {status === 'connected'
                      ? '● Connected'
                      : status === 'connecting'
                        ? '◌ Connecting...'
                        : '○ Disconnected'}
                  </span>
                </div>
                {gatewayUrl && (
                  <div className="settings-panel__info-row">
                    <span className="settings-panel__info-label">Gateway</span>
                    <code className="settings-panel__info-code">{gatewayUrl}</code>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'general' && (
            <div className="settings-panel__section">
              {/* Caffeinate */}
              <div className="settings-panel__group">
                <h3 className="settings-panel__group-title">System</h3>
                <CaffeinateToggle />
              </div>

              {/* About */}
              <div className="settings-panel__divider" />
              <div className="settings-panel__group">
                <h3 className="settings-panel__group-title">About</h3>
                <div className="settings-panel__about">
                  <div className="settings-panel__about-logo">
                    <Icon icon="lucide:chevron-left-dot" width={20} />
                    <span>Knot Code</span>
                  </div>
                  <p className="settings-panel__about-text">AI-native code editor by OpenKnot</p>
                  <div className="settings-panel__about-links">
                    <a
                      href="https://github.com/OpenKnots/code-editor"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="settings-panel__about-link"
                    >
                      <Icon icon="lucide:github" width={14} />
                      Source
                    </a>
                    <a
                      href="https://github.com/OpenKnots/code-editor/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="settings-panel__about-link"
                    >
                      <Icon icon="lucide:bug" width={14} />
                      Report Bug
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .settings-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          animation: fade-in 0.15s ease-out;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .settings-panel {
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 380px;
          max-width: 90vw;
          background: var(--bg-primary);
          border-left: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          animation: slide-in-right 0.2s ease-out;
          overflow: hidden;
        }
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .settings-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
        }
        .settings-panel__title {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        .settings-panel__close {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          transition: color 0.15s;
        }
        .settings-panel__close:hover {
          color: var(--text-primary);
        }
        .settings-panel__tabs {
          display: flex;
          gap: 4px;
          padding: 8px 16px;
          border-bottom: 1px solid var(--border);
        }
        .settings-panel__tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-muted);
          background: none;
          border: 1px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .settings-panel__tab:hover {
          color: var(--text-secondary);
          background: var(--bg-elevated);
        }
        .settings-panel__tab--active {
          color: var(--text-primary);
          background: var(--bg-elevated);
          border-color: var(--border);
        }
        .settings-panel__content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }
        .settings-panel__section {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .settings-panel__divider {
          height: 1px;
          background: var(--border);
          margin: 0 -4px;
        }
        .settings-panel__info {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .settings-panel__info-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
        }
        .settings-panel__info-label {
          color: var(--text-muted);
        }
        .settings-panel__info-value {
          color: var(--text-secondary);
          font-weight: 500;
        }
        .settings-panel__info-value--connected {
          color: #22c55e;
        }
        .settings-panel__info-value--connecting {
          color: #f59e0b;
        }
        .settings-panel__info-code {
          font-size: 11px;
          font-family: var(--font-mono, monospace);
          color: var(--text-secondary);
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .settings-panel__group {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .settings-panel__group-title {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0;
        }
        .settings-panel__about {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .settings-panel__about-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
        }
        .settings-panel__about-text {
          font-size: 12px;
          color: var(--text-secondary);
          margin: 0;
        }
        .settings-panel__about-links {
          display: flex;
          gap: 12px;
          margin-top: 4px;
        }
        .settings-panel__about-link {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--brand);
          text-decoration: none;
          transition: opacity 0.15s;
        }
        .settings-panel__about-link:hover {
          opacity: 0.8;
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes fade-in {
            from,
            to {
              opacity: 1;
            }
          }
          @keyframes slide-in-right {
            from,
            to {
              transform: none;
            }
          }
        }
      `}</style>
    </div>
  )
}
