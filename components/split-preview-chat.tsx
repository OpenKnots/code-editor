'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Icon } from '@iconify/react'
import { emit } from '@/lib/events'

const AgentPanel = dynamic(() => import('@/components/agent-panel').then((m) => m.AgentPanel), {
  ssr: false,
})

interface SplitPreviewChatProps {
  previewUrl?: string
  onClose?: () => void
}

export function SplitPreviewChat({ previewUrl = 'http://localhost:3000', onClose }: SplitPreviewChatProps) {
  const [splitRatio, setSplitRatio] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('knot-code:preview-split-ratio')
      return saved ? parseFloat(saved) : 0.5
    }
    return 0.5
  })
  const [url, setUrl] = useState(previewUrl)
  const [inputUrl, setInputUrl] = useState(previewUrl)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    setUrl(previewUrl)
    setInputUrl(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('knot-code:preview-split-ratio', splitRatio.toString())
    }
  }, [splitRatio])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const y = e.clientY - rect.top
      const ratio = Math.max(0.15, Math.min(0.85, y / rect.height))
      setSplitRatio(ratio)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src
    }
  }, [])

  const handleUrlSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    setUrl(inputUrl)
  }, [inputUrl])

  const handlePopOut = useCallback(() => {
    window.open(url, '_blank', 'width=1200,height=800')
  }, [url])

  const previewHeight = `calc(${splitRatio * 100}% - 4px)`
  const chatHeight = `calc(${(1 - splitRatio) * 100}% - 4px)`

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full overflow-hidden bg-[var(--bg)]">
      {/* Preview Section */}
      <div style={{ height: previewHeight, minHeight: '150px' }} className="flex flex-col border-b border-[var(--border)]">
        {/* Toolbar */}
        <div className="h-10 flex items-center gap-2 px-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Refresh"
          >
            <Icon icon="lucide:refresh-cw" width={14} height={14} />
          </button>
          <form onSubmit={handleUrlSubmit} className="flex-1 flex items-center gap-2">
            <div className="flex-1 relative">
              <Icon
                icon="lucide:globe"
                width={12}
                height={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
              />
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="http://localhost:3000"
                className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]"
              />
            </div>
            <button
              type="submit"
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--brand)] text-white hover:opacity-90 transition-opacity cursor-pointer"
            >
              Go
            </button>
          </form>
          <button
            onClick={handlePopOut}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Open in new window"
          >
            <Icon icon="lucide:external-link" width={14} height={14} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              title="Close split view"
            >
              <Icon icon="lucide:x" width={14} height={14} />
            </button>
          )}
        </div>

        {/* Preview iframe */}
        <div className="flex-1 min-h-0 bg-white">
          <iframe
            ref={iframeRef}
            src={url}
            className="w-full h-full border-0"
            title="Preview"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          />
        </div>
      </div>

      {/* Divider */}
      <div
        className="h-2 cursor-row-resize hover:bg-[var(--brand)] transition-colors bg-[var(--border)] shrink-0 relative group"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-8 h-0.5 rounded-full bg-white/60" />
        </div>
      </div>

      {/* Chat Section */}
      <div style={{ height: chatHeight, minHeight: '150px' }} className="flex flex-col">
        <AgentPanel />
      </div>
    </div>
  )
}
