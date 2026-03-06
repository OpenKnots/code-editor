'use client'

import { useState, useEffect, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'

/**
 * Mobile Connect Panel — QR code for connecting mobile devices to the gateway.
 * Inspired by Happy Coder's device handoff pattern, but using direct WebSocket
 * (no relay server needed).
 */
export function MobileConnect() {
  const { gatewayUrl, status } = useGateway()
  const [connectUrl, setConnectUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [connectedDevices, setConnectedDevices] = useState<string[]>([])

  useEffect(() => {
    if (!gatewayUrl) return
    // Build a connection URL that mobile devices can use
    // Replace localhost/127.0.0.1 with the machine's LAN IP hint
    const url = new URL(gatewayUrl.replace('ws://', 'http://').replace('wss://', 'https://'))
    const displayUrl = `knotcode://connect?gateway=${encodeURIComponent(gatewayUrl)}`
    setConnectUrl(displayUrl)
  }, [gatewayUrl])

  const copyUrl = useCallback(async () => {
    if (!gatewayUrl) return
    try {
      await navigator.clipboard.writeText(gatewayUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for clipboard API failure
    }
  }, [gatewayUrl])

  const isConnected = status === 'connected'

  return (
    <div className="mobile-connect">
      <div className="mobile-connect__header">
        <Icon icon="lucide:smartphone" width={18} />
        <span>Mobile Connect</span>
      </div>

      <div className="mobile-connect__content">
        {isConnected && gatewayUrl ? (
          <>
            {/* QR Code */}
            <div className="mobile-connect__qr-wrapper">
              <div className="mobile-connect__qr">
                <QRCodeSVG
                  value={gatewayUrl}
                  size={180}
                  bgColor="transparent"
                  fgColor="var(--text-primary)"
                  level="M"
                  marginSize={0}
                />
              </div>
              <p className="mobile-connect__hint">Scan with Knot Code iOS to connect</p>
            </div>

            {/* Gateway URL */}
            <div className="mobile-connect__url-row">
              <code className="mobile-connect__url">{gatewayUrl}</code>
              <button
                className="mobile-connect__copy-btn"
                onClick={copyUrl}
                title="Copy gateway URL"
              >
                <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} width={14} />
              </button>
            </div>

            {/* Connection Status */}
            <div className="mobile-connect__status">
              <div className="mobile-connect__status-dot mobile-connect__status-dot--active" />
              <span>Gateway active</span>
            </div>

            {/* Device List */}
            {connectedDevices.length > 0 && (
              <div className="mobile-connect__devices">
                <span className="mobile-connect__devices-label">Connected devices:</span>
                {connectedDevices.map((d, i) => (
                  <div key={i} className="mobile-connect__device">
                    <Icon icon="lucide:monitor-smartphone" width={13} />
                    <span>{d}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mobile-connect__offline">
            <Icon icon="lucide:wifi-off" width={24} />
            <p>Connect to a gateway first</p>
          </div>
        )}
      </div>

      <style jsx>{`
        .mobile-connect {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mobile-connect__header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          padding: 0 2px;
        }
        .mobile-connect__content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 20px;
          border-radius: var(--radius, 12px);
          background: var(--bg-elevated);
          border: 1px solid var(--border);
        }
        .mobile-connect__qr-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .mobile-connect__qr {
          padding: 16px;
          background: var(--bg-primary);
          border-radius: 12px;
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
        }
        .mobile-connect__qr:hover {
          transform: scale(1.02);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }
        .mobile-connect__hint {
          font-size: 12px;
          color: var(--text-secondary);
          text-align: center;
        }
        .mobile-connect__url-row {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          background: var(--bg-primary);
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        .mobile-connect__url {
          flex: 1;
          font-size: 11px;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: var(--font-mono, monospace);
        }
        .mobile-connect__copy-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          transition: color 0.15s;
        }
        .mobile-connect__copy-btn:hover {
          color: var(--brand);
        }
        .mobile-connect__status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--text-secondary);
        }
        .mobile-connect__status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-muted);
        }
        .mobile-connect__status-dot--active {
          background: #22c55e;
          box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
          animation: pulse-dot 2s ease-in-out infinite;
        }
        @keyframes pulse-dot {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
        .mobile-connect__devices {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .mobile-connect__devices-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .mobile-connect__device {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-secondary);
          padding: 4px 8px;
          background: var(--bg-primary);
          border-radius: 6px;
        }
        .mobile-connect__offline {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 20px;
          color: var(--text-muted);
          font-size: 13px;
        }
        @media (prefers-reduced-motion: reduce) {
          .mobile-connect__qr:hover {
            transform: none;
          }
          @keyframes pulse-dot {
            0%,
            100% {
              opacity: 1;
            }
          }
        }
      `}</style>
    </div>
  )
}
