'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'

/**
 * ⌘K Inline Edit — Cursor-style inline edit prompt.
 * Appears at the cursor/selection position in the editor.
 * User types instruction → dispatches to agent for processing.
 */

interface InlineEditProps {
  visible: boolean
  position: { top: number; left: number }
  selectedText: string
  filePath: string
  onSubmit: (instruction: string) => void
  onClose: () => void
}

export function InlineEdit({
  visible,
  position,
  selectedText,
  filePath,
  onSubmit,
  onClose,
}: InlineEditProps) {
  const [instruction, setInstruction] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (visible) {
      setInstruction('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [visible])

  const handleSubmit = useCallback(() => {
    if (!instruction.trim()) return
    onSubmit(instruction.trim())
    setInstruction('')
    onClose()
  }, [instruction, onSubmit, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [handleSubmit, onClose],
  )

  if (!visible) return null

  const previewText = selectedText.length > 60 ? selectedText.slice(0, 60) + '...' : selectedText

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Inline edit for ${filePath.split('/').pop() ?? filePath}`}
      className="fixed z-50 w-[400px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-xl)]"
      style={{
        top: Math.max(8, position.top),
        left: Math.max(
          8,
          Math.min(position.left, (typeof window !== 'undefined' ? window.innerWidth : 800) - 420),
        ),
      }}
    >
      {/* Header showing selected context */}
      {selectedText && (
        <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-1.5">
            <Icon
              icon="lucide:text-cursor-input"
              width={11}
              height={11}
              className="text-[var(--brand)] shrink-0"
            />
            <span className="text-[10px] text-[var(--text-tertiary)] truncate font-mono">
              {previewText}
            </span>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex items-start gap-2 px-3 py-3">
        <Icon
          icon="lucide:sparkles"
          width={14}
          height={14}
          className="mt-1 shrink-0 text-[var(--brand)]"
        />
        <textarea
          ref={inputRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Edit instruction..."
          rows={3}
          className="min-h-[66px] flex-1 resize-none bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
        />
        <button
          onClick={handleSubmit}
          disabled={!instruction.trim()}
          className="mt-1 rounded p-1 text-[var(--brand)] transition-opacity disabled:opacity-25 cursor-pointer"
        >
          <Icon icon="lucide:arrow-right" width={14} height={14} />
        </button>
      </div>

      {/* Hint */}
      <div className="px-3 pb-1.5 flex items-center gap-2">
        <span className="text-[9px] text-[var(--text-tertiary)]">
          <kbd className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 font-mono border border-[var(--border)]">
            Enter
          </kbd>{' '}
          submit
        </span>
        <span className="text-[9px] text-[var(--text-tertiary)]">
          <kbd className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 font-mono border border-[var(--border)]">
            Esc
          </kbd>{' '}
          cancel
        </span>
      </div>
    </div>
  )
}
