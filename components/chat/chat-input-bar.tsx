'use client'

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type DragEvent,
  type ClipboardEvent,
} from 'react'
import { Icon } from '@iconify/react'
import { ModeSelector } from '@/components/mode-selector'
import type { AgentMode } from '@/components/mode-selector'

export interface Suggestion {
  cmd: string
  desc: string
  icon: string
}

export interface ContextAttachment {
  type: 'selection' | 'file'
  path: string
  content: string
  startLine?: number
  endLine?: number
}

export interface ImageAttachment {
  name: string
  dataUrl: string
}

interface ModelInfo {
  current: string | null
  available: string[]
}

interface ChatInputBarProps {
  input: string
  setInput: (val: string) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  sending: boolean
  isStreaming: boolean
  isConnected: boolean
  suggestions: Suggestion[]
  agentMode: AgentMode
  setAgentMode: (mode: AgentMode) => void
  contextAttachments: ContextAttachment[]
  setContextAttachments: React.Dispatch<React.SetStateAction<ContextAttachment[]>>
  imageAttachments: ImageAttachment[]
  setImageAttachments: React.Dispatch<React.SetStateAction<ImageAttachment[]>>
  contextTokens: number
  modelInfo: ModelInfo
  activeFile: string | null
  atMenuOpen: boolean
  setAtMenuOpen: (v: boolean) => void
  atResults: string[]
  atMenuIdx: number
  setAtMenuIdx: (v: number | ((i: number) => number)) => void
  setAtQuery: (q: string) => void
  selectAtFile: (path: string) => void
  onSend: () => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  onFileDrop: (e: DragEvent<HTMLTextAreaElement>) => void
  onImagePaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void
  onFileAttach: () => void
}

export function ChatInputBar({
  input,
  setInput,
  inputRef,
  sending,
  isStreaming,
  isConnected,
  suggestions,
  agentMode,
  setAgentMode,
  contextAttachments,
  setContextAttachments,
  imageAttachments,
  setImageAttachments,
  contextTokens,
  modelInfo,
  activeFile,
  atMenuOpen,
  setAtMenuOpen,
  atResults,
  atMenuIdx,
  setAtMenuIdx,
  setAtQuery,
  selectAtFile,
  onSend,
  onKeyDown,
  onFileDrop,
  onImagePaste,
  onFileAttach,
}: ChatInputBarProps) {
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelMenuPos, setModelMenuPos] = useState<{ left: number; bottom: number } | null>(null)
  const modelBtnRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="px-3 pb-1 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s, i) => (
              <button
                key={s.cmd}
                onClick={() => {
                  setInput(s.cmd + ' ')
                  setActiveSuggestionIdx(-1)
                }}
                className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
                  i === activeSuggestionIdx
                    ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--brand)]'
                }`}
              >
                <Icon icon={s.icon} width={12} height={12} className="text-[var(--brand)]" />
                <span className="font-mono text-[var(--brand)]">{s.cmd}</span>
                <span className="text-[var(--text-tertiary)]">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-1 shrink-0">
        <div className="relative">
          {/* @ mention dropdown */}
          {atMenuOpen && atResults.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 max-h-[200px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl z-50">
              {atResults.map((path, i) => {
                const name = path.split('/').pop() || path
                const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
                return (
                  <button
                    key={path}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectAtFile(path)
                    }}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-[11px] transition-colors cursor-pointer ${
                      i === atMenuIdx
                        ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <Icon
                      icon="lucide:file-text"
                      width={12}
                      height={12}
                      className="text-[var(--text-tertiary)] shrink-0"
                    />
                    <span className="font-mono truncate">{name}</span>
                    {dir && (
                      <span className="text-[9px] text-[var(--text-disabled)] truncate ml-auto">
                        {dir}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Unified input container */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] focus-within:border-[color-mix(in_srgb,var(--brand)_50%,var(--border))] transition-colors overflow-hidden">
            {/* Attachment chips */}
            {(contextAttachments.length > 0 || imageAttachments.length > 0) && (
              <div className="flex flex-wrap gap-1 px-2.5 pt-2">
                {imageAttachments.map((img, i) => (
                  <div
                    key={`img-${i}`}
                    className="relative group/chip rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] overflow-hidden"
                    style={{ width: 72, height: 52 }}
                  >
                    <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 pb-0.5 pt-2">
                      <span className="text-[7px] text-white/90 font-mono truncate block">
                        {img.name.split('.')[0]}
                      </span>
                    </div>
                    <button
                      onClick={() => setImageAttachments((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-black/50 text-white/80 hover:bg-black/70 flex items-center justify-center opacity-0 group-hover/chip:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Icon icon="lucide:x" width={7} height={7} />
                    </button>
                  </div>
                ))}
                {contextAttachments.map((att, i) => (
                  <div
                    key={i}
                    className="relative group/chip flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1"
                  >
                    <Icon
                      icon={
                        att.type === 'selection' ? 'lucide:text-cursor-input' : 'lucide:file-text'
                      }
                      width={11}
                      height={11}
                      className="text-[var(--text-tertiary)] shrink-0"
                    />
                    <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate max-w-[120px]">
                      {att.type === 'selection'
                        ? `${att.path.split('/').pop()}:${att.startLine}-${att.endLine}`
                        : att.path.split('/').pop()}
                    </span>
                    <button
                      onClick={() =>
                        setContextAttachments((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="w-3.5 h-3.5 rounded-full text-[var(--text-disabled)] hover:text-[var(--text-primary)] flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Icon icon="lucide:x" width={8} height={8} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                const val = e.target.value
                setInput(val)
                setActiveSuggestionIdx(-1)
                const cursor = e.target.selectionStart ?? val.length
                const before = val.slice(0, cursor)
                const atMatch = before.match(/@([\w./\-]*)$/)
                if (atMatch) {
                  setAtMenuOpen(true)
                  setAtQuery(atMatch[1])
                  setAtMenuIdx(() => 0)
                } else {
                  setAtMenuOpen(false)
                  setAtQuery('')
                }
              }}
              onKeyDown={(e) => {
                if (atMenuOpen) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setAtMenuIdx((i: number) => Math.min(i + 1, atResults.length - 1))
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setAtMenuIdx((i: number) => Math.max(i - 1, 0))
                    return
                  }
                  if (e.key === 'Tab' || e.key === 'Enter') {
                    if (atResults.length > 0) {
                      e.preventDefault()
                      selectAtFile(atResults[atMenuIdx])
                      return
                    }
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setAtMenuOpen(false)
                    return
                  }
                }
                onKeyDown(e)
              }}
              onDrop={onFileDrop}
              onDragOver={(e) => e.preventDefault()}
              onPaste={onImagePaste}
              placeholder={
                activeFile
                  ? `Ask about ${activeFile.split('/').pop()}...`
                  : 'Ask or type /command...'
              }
              rows={1}
              className="w-full resize-none bg-transparent px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
            />

            {/* Bottom toolbar row */}
            <div className="flex items-center justify-between px-2 pb-1.5">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={onFileAttach}
                  className="p-1 rounded-md text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                  title="Attach file"
                >
                  <Icon icon="lucide:paperclip" width={14} height={14} />
                </button>
                <span className="text-[10px] text-[var(--text-disabled)] ml-1">
                  <kbd className="px-1 py-px rounded border border-[var(--border)] text-[9px] font-mono">
                    @
                  </kbd>
                </span>
              </div>
              <div className="flex items-center gap-1">
                {contextTokens > 0 && (
                  <span className="text-[10px] text-[var(--text-disabled)] tabular-nums mr-1">
                    ~{(contextTokens / 1000).toFixed(1)}k
                  </span>
                )}
                <button
                  onClick={onSend}
                  disabled={!input.trim() || sending}
                  className={`p-1 rounded-md transition-all cursor-pointer ${
                    input.trim() && !sending
                      ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90'
                      : 'text-[var(--text-disabled)] cursor-not-allowed'
                  }`}
                  title="Send (Enter)"
                >
                  <Icon
                    icon={isStreaming ? 'lucide:square' : 'lucide:arrow-up'}
                    width={14}
                    height={14}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar — mode + model */}
        <div className="flex items-center justify-between mt-1.5">
          <ModeSelector mode={agentMode} onChange={setAgentMode} />
          <div className="flex items-center gap-2">
            {modelInfo.current && (
              <div className="relative">
                <button
                  ref={modelBtnRef}
                  onClick={() => {
                    setModelMenuOpen((v) => {
                      if (!v && modelBtnRef.current) {
                        const rect = modelBtnRef.current.getBoundingClientRect()
                        setModelMenuPos({
                          left: rect.left,
                          bottom: window.innerHeight - rect.top + 4,
                        })
                      }
                      return !v
                    })
                  }}
                  className="flex items-center gap-1 text-[10px] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:sparkles" width={11} height={11} />
                  {modelInfo.current
                    .replace(/^.*\//, '')
                    .replace(/(claude-|gpt-)/, '')
                    .slice(0, 12)}
                  <Icon icon="lucide:chevron-down" width={9} height={9} />
                </button>
                {modelMenuOpen && modelMenuPos && (
                  <>
                    <div
                      className="fixed inset-0 z-[9990]"
                      onClick={() => setModelMenuOpen(false)}
                    />
                    <div
                      className="fixed z-[9991] w-52 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-xl py-1"
                      style={{ left: modelMenuPos.left, bottom: modelMenuPos.bottom }}
                    >
                      {modelInfo.available.slice(0, 4).map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            setModelMenuOpen(false)
                          }}
                          className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] transition-colors cursor-pointer ${
                            m === modelInfo.current
                              ? 'text-[var(--brand)]'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {m === modelInfo.current && (
                              <Icon icon="lucide:check" width={12} height={12} />
                            )}
                            <span className="font-mono">{m.replace(/^.*\//, '')}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
