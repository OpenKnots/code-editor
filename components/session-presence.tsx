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

  if (status !== 'connected' || clients.length === 0) return null

  if (compact) {
    return (
      <div className="flex items-center" title={`${clients.length} device(s) connected`}>
        <div className="flex items-center">
          {clients.slice(0, 3).map((c, i) => (
            <div
              key={c.clientId}
              className={`-ml-[5px] flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-[var(--bg)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)] ${i === 0 ? 'ml-0' : ''}`}
              style={{ zIndex: 3 - i }}
              title={c.displayName || c.clientId}
            >
              <Icon icon={deviceIcon(c.clientMode)} width={11} />
            </div>
          ))}
          {clients.length > 3 && (
            <div className="-ml-[5px] flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-[var(--bg)] bg-[var(--brand)] text-[8px] font-bold text-[var(--brand-contrast)]">
              +{clients.length - 3}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
        <Icon icon="lucide:users" width={14} />
        <span>{clients.length} connected</span>
      </div>
      <div className="flex flex-col gap-1">
        {clients.map((client) => (
          <div
            key={client.clientId}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--text-secondary)]"
          >
            <Icon icon={deviceIcon(client.clientMode)} width={14} />
            <span className="flex-1 truncate font-medium text-[var(--text-primary)]">
              {client.displayName || client.clientId}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--text-disabled)]">
              {client.clientMode}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
