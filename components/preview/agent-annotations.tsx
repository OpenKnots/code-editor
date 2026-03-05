'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import { usePreview, type AgentAnnotation } from '@/context/preview-context'
import { useEditor } from '@/context/editor-context'

/**
 * Agent Annotation Overlay — renders pulsing highlights on the preview
 * where the AI agent made changes. Click a highlight to jump to the code.
 */
export function AgentAnnotationOverlay({ iframeRef }: { iframeRef: React.RefObject<HTMLIFrameElement | null> }) {
  const { annotations, clearAnnotations } = usePreview()
  const { setActiveFile } = useEditor()
  const [positions, setPositions] = useState<Map<string, DOMRect>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fadeIn, setFadeIn] = useState(false)

  // Fade in on mount
  useEffect(() => {
    requestAnimationFrame(() => setFadeIn(true))
  }, [])

  // Try to resolve annotation positions by querying the iframe DOM
  useEffect(() => {
    if (!iframeRef.current?.contentDocument) return
    const doc = iframeRef.current.contentDocument
    const iframeRect = iframeRef.current.getBoundingClientRect()
    const newPositions = new Map<string, DOMRect>()

    for (const ann of annotations) {
      try {
        const el = doc.querySelector(ann.selector)
        if (el) {
          const rect = el.getBoundingClientRect()
          // Adjust relative to iframe position
          const adjusted = new DOMRect(
            rect.x, rect.y,
            rect.width, rect.height
          )
          newPositions.set(ann.id, adjusted)
        }
      } catch {
        // Cross-origin — use fallback grid positions
      }
    }

    setPositions(newPositions)
  }, [annotations, iframeRef])

  const handleClick = useCallback((ann: AgentAnnotation) => {
    setSelectedId(ann.id)
    // Navigate to the file + line in the editor
    if (ann.filePath) {
      window.dispatchEvent(new CustomEvent('file-select', { detail: { path: ann.filePath } }))
    }
  }, [])

  if (annotations.length === 0) return null

  return (
    <>
      {/* Floating annotation panel */}
      <div className={`absolute top-2 right-2 z-20 w-[220px] transition-all duration-500 ${fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
        <div className="rounded-xl border border-[var(--color-ai-border)] bg-[var(--bg-elevated)] shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-1.5">
              <Icon icon="lucide:sparkles" width={13} height={13} className="text-[var(--color-ai)] animate-sparkle" />
              <span className="text-[10px] font-semibold text-[var(--text-primary)]">Agent Changes</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-ai-muted)] text-[var(--color-ai)] font-medium">{annotations.length}</span>
            </div>
            <button onClick={clearAnnotations} className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-pointer">
              <Icon icon="lucide:x" width={11} height={11} />
            </button>
          </div>

          {/* Annotation list */}
          <div className="max-h-[200px] overflow-y-auto">
            {annotations.map((ann, i) => (
              <button
                key={ann.id}
                onClick={() => handleClick(ann)}
                className={`w-full text-left px-3 py-2 border-b border-[var(--border)] last:border-0 transition-colors cursor-pointer ${
                  selectedId === ann.id
                    ? 'bg-[var(--color-ai-hover-bg)]'
                    : 'hover:bg-[var(--bg-subtle)]'
                }`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    ann.type === 'added' ? 'bg-[var(--color-additions)]' :
                    ann.type === 'removed' ? 'bg-[var(--color-deletions)]' :
                    'bg-[var(--color-ai)]'
                  }`} />
                  <span className="text-[10px] font-medium text-[var(--text-primary)] truncate">{ann.label}</span>
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <span className="text-[9px] text-[var(--text-disabled)] font-mono truncate">{ann.filePath.split('/').pop()}</span>
                  {ann.line && <span className="text-[9px] text-[var(--text-disabled)]">:{ann.line}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overlay highlights on the preview */}
      {Array.from(positions.entries()).map(([id, rect]) => {
        const ann = annotations.find(a => a.id === id)
        if (!ann) return null
        const isSelected = selectedId === id

        return (
          <div
            key={id}
            onClick={() => handleClick(ann)}
            className={`absolute cursor-pointer transition-all ${
              isSelected ? 'z-20' : 'z-10'
            }`}
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
            }}
          >
            {/* Pulsing border */}
            <div className={`absolute inset-0 rounded border-2 ${
              ann.type === 'added' ? 'border-[var(--color-additions)]' :
              ann.type === 'removed' ? 'border-[var(--color-deletions)]' :
              'border-[var(--color-ai)]'
            } ${isSelected ? 'opacity-100' : 'opacity-60 animate-pulse'}`} />

            {/* Glow effect */}
            <div className={`absolute inset-0 rounded ${
              ann.type === 'added' ? 'bg-[var(--color-additions)]' :
              ann.type === 'removed' ? 'bg-[var(--color-deletions)]' :
              'bg-[var(--color-ai)]'
            } opacity-10 animate-pulse`} />

            {/* Label badge */}
            <div className={`absolute -top-5 left-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-medium whitespace-nowrap ${
              ann.type === 'added' ? 'bg-[var(--color-additions)] text-[var(--on-additions)]' :
              ann.type === 'removed' ? 'bg-[var(--color-deletions)] text-[var(--on-deletions)]' :
              'bg-[var(--color-ai)] text-[var(--brand-contrast)]'
            } shadow-sm`}>
              <Icon icon={ann.type === 'added' ? 'lucide:plus' : ann.type === 'removed' ? 'lucide:minus' : 'lucide:pencil'} width={8} height={8} />
              {ann.label}
            </div>
          </div>
        )
      })}
    </>
  )
}
