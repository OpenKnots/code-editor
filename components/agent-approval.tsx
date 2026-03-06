'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'

interface ApprovalRequest {
  id: string
  type: 'tool_call' | 'file_write' | 'command' | 'network' | 'generic'
  title: string
  description: string
  details?: string
  timestamp: number
  sessionKey: string
}

/**
 * Agent Approval Panel — Shows pending approval requests from the agent.
 * Enables approve/deny from any device (desktop or mobile).
 * The gateway broadcasts approval events to all connected clients.
 */
export function AgentApproval() {
  const { onEvent, sendRequest, status } = useGateway()
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'connected') return

    const unsub = onEvent('agent.approval.request', (data: any) => {
      const request: ApprovalRequest = {
        id: data.id || crypto.randomUUID(),
        type: data.type || 'generic',
        title: data.title || 'Agent needs approval',
        description: data.description || data.message || '',
        details: data.details || data.code || data.command,
        timestamp: Date.now(),
        sessionKey: data.sessionKey || '',
      }
      setApprovals((prev) => [request, ...prev])

      // Vibrate on mobile if supported
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100])
      }
    })

    return unsub
  }, [onEvent, status])

  const respond = useCallback(
    async (id: string, approved: boolean) => {
      try {
        await sendRequest('agent.approval.respond', { id, approved })
        setApprovals((prev) => prev.filter((a) => a.id !== id))
      } catch (err) {
        console.error('Failed to respond to approval:', err)
      }
    },
    [sendRequest],
  )

  const typeIcon = (type: ApprovalRequest['type']) => {
    switch (type) {
      case 'tool_call':
        return 'lucide:wrench'
      case 'file_write':
        return 'lucide:file-edit'
      case 'command':
        return 'lucide:terminal'
      case 'network':
        return 'lucide:globe'
      default:
        return 'lucide:shield-question'
    }
  }

  const typeColor = (type: ApprovalRequest['type']) => {
    switch (type) {
      case 'command':
        return 'var(--brand)'
      case 'file_write':
        return '#f59e0b'
      case 'network':
        return '#3b82f6'
      default:
        return 'var(--text-secondary)'
    }
  }

  if (approvals.length === 0) return null

  return (
    <div className="agent-approval">
      <div className="agent-approval__badge">
        <Icon icon="lucide:shield-alert" width={14} />
        <span>{approvals.length} pending</span>
      </div>

      <div className="agent-approval__list">
        {approvals.map((approval) => (
          <div key={approval.id} className="agent-approval__card">
            <div className="agent-approval__card-header">
              <Icon
                icon={typeIcon(approval.type)}
                width={16}
                style={{ color: typeColor(approval.type) }}
              />
              <span className="agent-approval__card-title">{approval.title}</span>
              <span className="agent-approval__card-time">{formatTime(approval.timestamp)}</span>
            </div>

            <p className="agent-approval__card-desc">{approval.description}</p>

            {approval.details && (
              <button
                className="agent-approval__toggle"
                onClick={() => setExpandedId(expandedId === approval.id ? null : approval.id)}
              >
                <Icon
                  icon={expandedId === approval.id ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                  width={12}
                />
                {expandedId === approval.id ? 'Hide' : 'Show'} details
              </button>
            )}

            {expandedId === approval.id && approval.details && (
              <pre className="agent-approval__details">{approval.details}</pre>
            )}

            <div className="agent-approval__actions">
              <button
                className="agent-approval__btn agent-approval__btn--deny"
                onClick={() => respond(approval.id, false)}
              >
                <Icon icon="lucide:x" width={14} />
                Deny
              </button>
              <button
                className="agent-approval__btn agent-approval__btn--approve"
                onClick={() => respond(approval.id, true)}
              >
                <Icon icon="lucide:check" width={14} />
                Approve
              </button>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .agent-approval {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .agent-approval__badge {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #f59e0b;
          padding: 6px 10px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.2);
          border-radius: 8px;
          animation: approval-pulse 2s ease-in-out infinite;
        }
        @keyframes approval-pulse {
          0%,
          100% {
            border-color: rgba(245, 158, 11, 0.2);
          }
          50% {
            border-color: rgba(245, 158, 11, 0.5);
          }
        }
        .agent-approval__list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .agent-approval__card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 10px;
          animation: slide-in 0.2s ease-out;
        }
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .agent-approval__card-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .agent-approval__card-title {
          flex: 1;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .agent-approval__card-time {
          font-size: 11px;
          color: var(--text-muted);
        }
        .agent-approval__card-desc {
          font-size: 12px;
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.5;
        }
        .agent-approval__toggle {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--text-muted);
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px 0;
        }
        .agent-approval__toggle:hover {
          color: var(--text-secondary);
        }
        .agent-approval__details {
          font-size: 11px;
          font-family: var(--font-mono, monospace);
          color: var(--text-secondary);
          background: var(--bg-primary);
          padding: 8px 10px;
          border-radius: 6px;
          overflow-x: auto;
          max-height: 120px;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .agent-approval__actions {
          display: flex;
          gap: 8px;
          margin-top: 4px;
        }
        .agent-approval__btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--border);
          transition: all 0.15s;
        }
        .agent-approval__btn--deny {
          background: transparent;
          color: var(--text-secondary);
        }
        .agent-approval__btn--deny:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.3);
          color: #ef4444;
        }
        .agent-approval__btn--approve {
          background: var(--brand);
          color: white;
          border-color: var(--brand);
        }
        .agent-approval__btn--approve:hover {
          filter: brightness(1.1);
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes slide-in {
            from,
            to {
              opacity: 1;
              transform: none;
            }
          }
          @keyframes approval-pulse {
            0%,
            100% {
              border-color: rgba(245, 158, 11, 0.2);
            }
          }
        }
      `}</style>
    </div>
  )
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
