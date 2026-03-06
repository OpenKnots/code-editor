'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'

interface ConnectedClient {
  clientId: string
  clientMode: string
  displayName?: string
  connectedAt: number
}

/**
 * Session Presence — Shows connected devices/clients on this gateway.
 * Enables awareness of who's watching the agent work.
 */
export function SessionPresence({ compact = false }: { compact?: boolean }) {
  const { onEvent, sendRequest, status } = useGateway()
  const [clients, setClients] = useState<ConnectedClient[]>([])

  useEffect(() => {
    if (status !== 'connected') return

    // Request current client list
    sendRequest('gateway.clients', {})
      .then((data: any) => {
        if (data?.clients) {
          setClients(data.clients)
        }
      })
      .catch(() => {})

    // Listen for client connect/disconnect
    const unsubConnect = onEvent('gateway.client.connected', (data: any) => {
      setClients((prev) => [
        ...prev.filter((c) => c.clientId !== data.clientId),
        {
          clientId: data.clientId,
          clientMode: data.clientMode || 'unknown',
          displayName: data.displayName,
          connectedAt: Date.now(),
        },
      ])
    })

    const unsubDisconnect = onEvent('gateway.client.disconnected', (data: any) => {
      setClients((prev) => prev.filter((c) => c.clientId !== data.clientId))
    })

    return () => {
      unsubConnect?.()
      unsubDisconnect?.()
    }
  }, [onEvent, sendRequest, status])

  const deviceIcon = (mode: string) => {
    switch (mode) {
      case 'ui':
        return 'lucide:monitor'
      case 'node':
        return 'lucide:smartphone'
      case 'operator':
        return 'lucide:monitor-smartphone'
      default:
        return 'lucide:circle-dot'
    }
  }

  if (clients.length === 0) return null

  if (compact) {
    return (
      <div className="presence-compact" title={`${clients.length} device(s) connected`}>
        <div className="presence-compact__avatars">
          {clients.slice(0, 3).map((c, i) => (
            <div
              key={c.clientId}
              className="presence-compact__avatar"
              style={{ zIndex: 3 - i }}
              title={c.displayName || c.clientId}
            >
              <Icon icon={deviceIcon(c.clientMode)} width={11} />
            </div>
          ))}
          {clients.length > 3 && (
            <div className="presence-compact__more">+{clients.length - 3}</div>
          )}
        </div>

        <style jsx>{`
          .presence-compact {
            display: flex;
            align-items: center;
          }
          .presence-compact__avatars {
            display: flex;
          }
          .presence-compact__avatar {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: var(--bg-elevated);
            border: 2px solid var(--bg-primary);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-secondary);
            margin-left: -6px;
          }
          .presence-compact__avatar:first-child {
            margin-left: 0;
          }
          .presence-compact__more {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: var(--brand);
            border: 2px solid var(--bg-primary);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 9px;
            font-weight: 700;
            margin-left: -6px;
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="session-presence">
      <div className="session-presence__header">
        <Icon icon="lucide:users" width={14} />
        <span>{clients.length} connected</span>
      </div>
      <div className="session-presence__list">
        {clients.map((client) => (
          <div key={client.clientId} className="session-presence__client">
            <Icon icon={deviceIcon(client.clientMode)} width={14} />
            <span className="session-presence__name">{client.displayName || client.clientId}</span>
            <span className="session-presence__mode">{client.clientMode}</span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .session-presence {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .session-presence__header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .session-presence__list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .session-presence__client {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          font-size: 12px;
          color: var(--text-secondary);
          background: var(--bg-elevated);
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        .session-presence__name {
          flex: 1;
          color: var(--text-primary);
          font-weight: 500;
        }
        .session-presence__mode {
          font-size: 10px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
      `}</style>
    </div>
  )
}
