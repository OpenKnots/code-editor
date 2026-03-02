'use client'

import React from 'react'
import { useRef, useState, useCallback, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useWorkflow, type WorkflowNode, type WorkflowEdge } from '@/context/workflow-context'
import { useGateway } from '@/context/gateway-context'
import { nodeKindIcon } from './workflow-list'
import { NodeInspector } from './node-inspector'
import { NodePalette } from './node-palette'

export function WorkflowCanvas() {
  const {
    activeWorkflow, runWorkflow, stopWorkflow,
    selectedNodeId, setSelectedNodeId,
    updateNodePosition, executionLog,
    approveHumanNode, rejectHumanNode,
  } = useWorkflow()
  const { status: gwStatus } = useGateway()
  const svgRef = useRef<SVGSVGElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  if (!activeWorkflow) return null
  const { nodes, edges, status } = activeWorkflow
  const workflowId = activeWorkflow.id
  const isConnected = gwStatus === 'connected'
  const selectedNode = nodes.find(n => n.id === selectedNodeId)

  // ── Node drag — document-level listeners for reliability ────
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    e.preventDefault()
    const node = nodes.find(n => n.id === nodeId)
    if (!node || !scrollRef.current) return
    const scrollEl = scrollRef.current
    const scrollRect = scrollEl.getBoundingClientRect()
    // Offset = mouse position relative to node origin, accounting for scroll
    draggingRef.current = {
      nodeId,
      offsetX: e.clientX - scrollRect.left + scrollEl.scrollLeft - node.x,
      offsetY: e.clientY - scrollRect.top + scrollEl.scrollTop - node.y,
    }
    setIsDragging(true)
    setSelectedNodeId(nodeId)
  }, [nodes, setSelectedNodeId])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = draggingRef.current
      if (!drag || !scrollRef.current) return
      const scrollEl = scrollRef.current
      const scrollRect = scrollEl.getBoundingClientRect()
      const x = Math.max(0, e.clientX - scrollRect.left + scrollEl.scrollLeft - drag.offsetX)
      const y = Math.max(0, e.clientY - scrollRect.top + scrollEl.scrollTop - drag.offsetY)
      updateNodePosition(workflowId, drag.nodeId, Math.round(x), Math.round(y))
    }

    const onMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = null
        setIsDragging(false)
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [workflowId, updateNodePosition])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as SVGElement).tagName === 'svg') {
      setSelectedNodeId(null)
    }
  }, [setSelectedNodeId])

  // ── Layout calculations ──────────────────────────────────
  const padding = 80
  const maxX = Math.max(...nodes.map(n => n.x), 400) + 220
  const maxY = Math.max(...nodes.map(n => n.y), 300) + 140

  const nodeStatusColor = (s: string) => {
    switch (s) {
      case 'success': return { bg: 'var(--success)', bgMuted: 'color-mix(in srgb, var(--success) 12%, transparent)', text: 'var(--success)' }
      case 'running': return { bg: 'var(--brand)', bgMuted: 'color-mix(in srgb, var(--brand) 12%, transparent)', text: 'var(--brand)' }
      case 'error': return { bg: 'var(--error)', bgMuted: 'color-mix(in srgb, var(--error) 12%, transparent)', text: 'var(--error)' }
      case 'waiting': return { bg: 'var(--warning)', bgMuted: 'color-mix(in srgb, var(--warning) 12%, transparent)', text: 'var(--warning)' }
      case 'skipped': return { bg: 'var(--text-disabled)', bgMuted: 'var(--bg-subtle)', text: 'var(--text-disabled)' }
      default: return { bg: 'var(--text-disabled)', bgMuted: 'var(--bg-subtle)', text: 'var(--text-disabled)' }
    }
  }

  const getEdgePath = (edge: WorkflowEdge) => {
    const from = nodes.find(n => n.id === edge.from)
    const to = nodes.find(n => n.id === edge.to)
    if (!from || !to) return ''
    const x1 = from.x + 140, y1 = from.y + 25
    const x2 = to.x, y2 = to.y + 25
    const cx = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] shrink-0">
          <Icon icon="lucide:workflow" width={14} height={14} className="text-[var(--brand)]" />
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">{activeWorkflow.name}</span>
          {activeWorkflow.description && (
            <span className="text-[10px] text-[var(--text-tertiary)] mx-2 truncate">— {activeWorkflow.description}</span>
          )}
          <div className="flex-1" />
          {!isConnected && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]">
              <Icon icon="lucide:wifi-off" width={10} height={10} />
              Disconnected
            </span>
          )}
          <NodePalette />
          <span className="text-[10px] text-[var(--text-disabled)]">{nodes.length} nodes · {edges.length} edges</span>
          <div className="flex gap-1 ml-2">
            {status === 'running' ? (
              <button onClick={() => stopWorkflow(workflowId)} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-[color-mix(in_srgb,var(--error)_12%,transparent)] text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_20%,transparent)] cursor-pointer">
                <Icon icon="lucide:square" width={10} height={10} />
                Stop
              </button>
            ) : (
              <button onClick={() => runWorkflow(workflowId)} disabled={!isConnected} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 disabled:opacity-40 cursor-pointer">
                <Icon icon="lucide:play" width={10} height={10} />
                Run
              </button>
            )}
          </div>
        </div>

        {/* SVG Canvas */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto bg-[var(--bg)] relative select-none"
          style={{
            backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            cursor: isDragging ? 'grabbing' : 'default',
          }}
        >
          <svg
            ref={svgRef}
            width={maxX + padding}
            height={maxY + padding}
            className="min-w-full min-h-full"
            onClick={handleCanvasClick}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--text-disabled)" opacity="0.5" />
              </marker>
              <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--brand)" opacity="0.8" />
              </marker>
              <filter id="node-glow">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Edges */}
            {edges.map(edge => {
              const from = nodes.find(n => n.id === edge.from)
              const isActive = from?.status === 'success' || from?.status === 'running'
              const isSkipped = from?.status === 'skipped'
              const path = getEdgePath(edge)
              return (
                <g key={edge.id}>
                  <path
                    d={path} fill="none"
                    stroke={isSkipped ? 'var(--text-disabled)' : isActive ? 'var(--brand)' : 'var(--border)'}
                    strokeWidth={isActive ? 2 : 1.5}
                    strokeDasharray={isActive ? 'none' : '4 3'}
                    markerEnd={isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                    opacity={isSkipped ? 0.2 : isActive ? 0.8 : 0.4}
                  />
                  {from?.status === 'running' && (
                    <circle r="3" fill="var(--brand)" opacity="0.9">
                      <animateMotion dur="1.5s" repeatCount="indefinite" path={path} />
                    </circle>
                  )}
                  {edge.label && from && (() => {
                    const to = nodes.find(n => n.id === edge.to)
                    if (!to) return null
                    return (
                      <text x={(from.x + 140 + to.x) / 2} y={(from.y + to.y) / 2 + 16} textAnchor="middle" className="text-[9px] fill-[var(--text-disabled)]" fontFamily="var(--font-mono, monospace)">
                        {edge.label}
                      </text>
                    )
                  })()}
                </g>
              )
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const colors = nodeStatusColor(node.status)
              const isSelected = node.id === selectedNodeId
              const isWaiting = node.status === 'waiting'
              const isNodeDragging = isDragging && draggingRef.current?.nodeId === node.id
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  style={{ cursor: isNodeDragging ? 'grabbing' : 'grab' }}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                >
                  {isSelected && (
                    <rect x="-3" y="-3" width="146" height="56" rx="11" fill="none" stroke="var(--brand)" strokeWidth="2" strokeDasharray="4 2" opacity="0.6" />
                  )}
                  {node.status === 'running' && (
                    <rect x="-4" y="-4" width="148" height="58" rx="12" fill="none" stroke={colors.bg} strokeWidth="2" opacity="0.3" filter="url(#node-glow)">
                      <animate attributeName="opacity" values="0.2;0.5;0.2" dur="1.5s" repeatCount="indefinite" />
                    </rect>
                  )}
                  <rect width="140" height="50" rx="8" fill="var(--bg-elevated)" stroke={isSelected ? 'var(--brand)' : colors.bg} strokeWidth={node.status === 'idle' && !isSelected ? 1 : 2} opacity={node.status === 'skipped' ? 0.35 : 1} />
                  <foreignObject x="8" y="6" width="24" height="24">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: colors.bgMuted }}>
                      <Icon icon={nodeKindIcon(node.kind)} width={12} height={12} style={{ color: colors.text }} className={node.status === 'running' ? 'animate-spin' : ''} />
                    </div>
                  </foreignObject>
                  <text x="38" y="18" className="text-[10px] font-medium" fill="var(--text-primary)" fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none' }}>
                    {node.label.length > 14 ? node.label.slice(0, 13) + '…' : node.label}
                  </text>
                  <text x="38" y="32" className="text-[8px]" fill="var(--text-disabled)" fontFamily="var(--font-mono, monospace)" style={{ pointerEvents: 'none' }}>
                    {node.duration ? `${(node.duration / 1000).toFixed(1)}s` : ''}
                    {node.tokens ? ` · ${((node.tokens.input + node.tokens.output) / 1000).toFixed(1)}k tok` : ''}
                  </text>
                  {typeof node.config.model === "string" && node.config.model && (
                    <text x="38" y="44" className="text-[7px]" fill="var(--text-disabled)" fontFamily="var(--font-mono, monospace)" style={{ pointerEvents: 'none' }}>
                      {String(node.config.model).split('/').pop()?.split('-').slice(-2).join('-')}
                    </text>
                  )}
                  <circle cx="130" cy="10" r="4" fill={colors.bg} opacity={node.status === 'idle' ? 0.3 : 0.8}>
                    {node.status === 'running' && (
                      <animate attributeName="opacity" values="0.4;1;0.4" dur="1s" repeatCount="indefinite" />
                    )}
                  </circle>
                  {isWaiting && (
                    <foreignObject x="8" y="52" width="132" height="28">
                      <div className="flex gap-1">
                        <button onClick={(e) => { e.stopPropagation(); approveHumanNode(node.id) }} className="flex-1 px-2 py-0.5 rounded text-[9px] font-medium bg-[var(--success)] text-white hover:opacity-90 cursor-pointer">✓ Approve</button>
                        <button onClick={(e) => { e.stopPropagation(); rejectHumanNode(node.id) }} className="flex-1 px-2 py-0.5 rounded text-[9px] font-medium bg-[var(--error)] text-white hover:opacity-90 cursor-pointer">✗ Reject</button>
                      </div>
                    </foreignObject>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {/* Execution log */}
        {executionLog.length > 0 && (
          <div className="h-[120px] border-t border-[var(--border)] bg-[var(--bg-elevated)] overflow-y-auto shrink-0">
            <div className="flex items-center px-3 py-1 border-b border-[var(--border)]">
              <Icon icon="lucide:terminal" width={11} height={11} className="text-[var(--text-disabled)] mr-1.5" />
              <span className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Execution Log</span>
            </div>
            <div className="px-3 py-1 font-mono text-[10px] text-[var(--text-secondary)] space-y-0.5">
              {executionLog.map((msg, i) => (
                <div key={i} className={msg.startsWith('✗') ? 'text-[var(--error)]' : msg.startsWith('✓') ? 'text-[var(--success)]' : msg.startsWith('⏸') ? 'text-[var(--warning)]' : ''}>{msg}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedNode && <NodeInspector node={selectedNode} workflowId={workflowId} />}
    </div>
  )
}
