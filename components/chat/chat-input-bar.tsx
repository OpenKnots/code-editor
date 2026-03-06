'use client'

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
  type DragEvent,
  type ClipboardEvent,
} from 'react'
import { Icon } from '@iconify/react'
import { formatShortcut } from '@/lib/platform'
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
  onImageAttach: () => void
}

function getFileTypeIcon(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'lucide:file-type'
    case 'js':
    case 'jsx':
      return 'lucide:file-json'
    case 'css':
    case 'scss':
    case 'less':
      return 'lucide:palette'
    case 'json':
      return 'lucide:braces'
    case 'md':
    case 'mdx':
      return 'lucide:file-text'
    case 'py':
      return 'lucide:file-code'
    case 'rs':
    case 'go':
    case 'java':
    case 'cpp':
    case 'c':
      return 'lucide:file-code-2'
    case 'svg':
    case 'png':
    case 'jpg':
    case 'gif':
      return 'lucide:image'
    default:
      return 'lucide:file-text'
  }
}

function formatFileSize(dataUrl: string): string {
  const base64 = dataUrl.split(',')[1] ?? ''
  const bytes = Math.ceil(base64.length * 0.75)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getPlaceholderHints(): string[] {
  return [
    'Ask anything...',
    `Ask anything... ${formatShortcut('meta+L')} to add selection`,
    'Ask anything... @ to mention a file',
    'Ask anything... /commit to save changes',
  ]
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
  onImageAttach,
}: ChatInputBarProps) {
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelMenuPos, setModelMenuPos] = useState<{ left: number; bottom: number } | null>(null)
  const modelBtnRef = useRef<HTMLButtonElement>(null)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [inputDragOver, setInputDragOver] = useState(false)
  const inputDragCounter = useRef(0)

  const placeholderHints = useMemo(() => getPlaceholderHints(), [])

  useEffect(() => {
    if (input) return
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % placeholderHints.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [input, placeholderHints.length])

  const currentPlaceholder = activeFile
    ? `Ask about ${activeFile.split('/').pop()}...`
    : placeholderHints[placeholderIdx]

  const handleInputDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    inputDragCounter.current++
    if (e.dataTransfer.types.includes('Files')) {
      setInputDragOver(true)
    }
  }, [])

  const handleInputDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    inputDragCounter.current--
    if (inputDragCounter.current <= 0) {
      inputDragCounter.current = 0
      setInputDragOver(false)
    }
  }, [])

  const handleInputDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      inputDragCounter.current = 0
      setInputDragOver(false)
      const dropped = Array.from(e.dataTransfer.files).slice(0, 5)
      for (const file of dropped) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader()
          reader.onload = () => {
            setImageAttachments((prev) => [
              ...prev,
              { name: file.name, dataUrl: reader.result as string },
            ])
          }
          reader.readAsDataURL(file)
        } else {
          const reader = new FileReader()
          reader.onload = () => {
            setContextAttachments((prev) => [
              ...prev,
              {
                type: 'file' as const,
                path: file.name,
                content: (reader.result as string).slice(0, 12000),
              },
            ])
          }
          reader.readAsText(file)
        }
      }
      inputRef.current?.focus()
    },
    [setImageAttachments, setContextAttachments, inputRef],
  )

  return (
    <>
      {/* Lightbox overlay */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-zoom-out animate-fade-in"
          style={{ animationDuration: '0.15s' }}
          onClick={() => setLightboxSrc(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[85vh] animate-scale-in"
            style={{ animationDuration: '0.2s' }}
          >
            <img
              src={lightboxSrc}
              alt="Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setLightboxSrc(null)
              }}
              className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center shadow-lg hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
            >
              <Icon
                icon="lucide:x"
                width={14}
                height={14}
                className="text-[var(--text-secondary)]"
              />
            </button>
          </div>
        </div>
      )}

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
                      icon={getFileTypeIcon(path)}
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

          {/* Unified input container with drag-drop zone */}
          <div
            className={`input-focus-glow rounded-xl border bg-[var(--bg)] focus-within:border-[color-mix(in_srgb,var(--brand)_50%,var(--border))] transition-all overflow-hidden ${
              inputDragOver
                ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_4%,transparent)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--brand)_15%,transparent)]'
                : 'border-[var(--border)]'
            }`}
            onDragEnter={handleInputDragEnter}
            onDragLeave={handleInputDragLeave}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={handleInputDrop}
          >
            {/* Active file context pill */}
            {activeFile && contextAttachments.length === 0 && imageAttachments.length === 0 && (
              <div className="flex items-center gap-1.5 px-2.5 pt-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono bg-[color-mix(in_srgb,var(--brand)_6%,transparent)] border border-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--text-tertiary)]">
                  <Icon
                    icon={getFileTypeIcon(activeFile)}
                    width={9}
                    height={9}
                    className="text-[var(--brand)]"
                  />
                  Editing: {activeFile.split('/').pop()}
                </span>
              </div>
            )}

            {/* Rich attachment previews */}
            {(contextAttachments.length > 0 || imageAttachments.length > 0) && (
              <div className="px-2.5 pt-2 pb-0.5">
                {/* Image grid */}
                {imageAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {imageAttachments.map((img, i) => (
                      <div
                        key={`img-${i}`}
                        className="relative group/img rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] overflow-hidden cursor-pointer hover:border-[var(--brand)] transition-all hover:shadow-[0_0_12px_color-mix(in_srgb,var(--brand)_12%,transparent)]"
                        style={{ width: 88, height: 64 }}
                        onClick={() => setLightboxSrc(img.dataUrl)}
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover/img:scale-105"
                        />
                        {/* Hover info overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-150 flex flex-col justify-end p-1.5">
                          <span className="text-[8px] text-white/90 font-mono truncate leading-tight">
                            {img.name}
                          </span>
                          <span className="text-[7px] text-white/60 font-mono leading-tight">
                            {formatFileSize(img.dataUrl)}
                          </span>
                        </div>
                        {/* Zoom hint */}
                        <div className="absolute top-1 left-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                          <Icon
                            icon="lucide:zoom-in"
                            width={10}
                            height={10}
                            className="text-white/70 drop-shadow-md"
                          />
                        </div>
                        {/* Remove button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setImageAttachments((prev) => prev.filter((_, j) => j !== i))
                          }}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 text-white/80 hover:bg-red-500/80 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all cursor-pointer"
                        >
                          <Icon icon="lucide:x" width={8} height={8} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* File/selection chips */}
                {contextAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {contextAttachments.map((att, i) => {
                      const isSelection = att.type === 'selection'
                      const fileName = att.path.split('/').pop() ?? att.path
                      const lineRange = isSelection ? `${att.startLine}-${att.endLine}` : null
                      const lineCount =
                        isSelection && att.startLine && att.endLine
                          ? att.endLine - att.startLine + 1
                          : att.content.split('\n').length

                      return (
                        <div
                          key={i}
                          className="group/chip flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 hover:border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] transition-colors"
                        >
                          <div className="w-5 h-5 rounded-md bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] flex items-center justify-center shrink-0">
                            <Icon
                              icon={
                                isSelection ? 'lucide:text-cursor-input' : getFileTypeIcon(att.path)
                              }
                              width={10}
                              height={10}
                              className="text-[var(--brand)]"
                            />
                          </div>
                          <div className="min-w-0 flex flex-col">
                            <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate max-w-[140px] leading-tight">
                              {fileName}
                              {lineRange && (
                                <span className="text-[var(--text-disabled)]">:{lineRange}</span>
                              )}
                            </span>
                            <span className="text-[8px] text-[var(--text-disabled)] leading-tight">
                              {lineCount} line{lineCount !== 1 ? 's' : ''}
                              {isSelection ? ' selected' : ''}
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              setContextAttachments((prev) => prev.filter((_, j) => j !== i))
                            }
                            className="w-4 h-4 rounded-full text-[var(--text-disabled)] hover:text-[var(--color-deletions)] hover:bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                          >
                            <Icon icon="lucide:x" width={8} height={8} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Drop target indicator */}
            {inputDragOver && (
              <div
                className="flex items-center justify-center gap-2 py-2 mx-2.5 mb-1 rounded-lg border border-dashed border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,transparent)] animate-fade-in"
                style={{ animationDuration: '0.1s' }}
              >
                <Icon
                  icon="lucide:download"
                  width={13}
                  height={13}
                  className="text-[var(--brand)]"
                />
                <span className="text-[11px] text-[var(--brand)] font-medium">Drop to attach</span>
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
              placeholder={currentPlaceholder}
              rows={1}
              className="w-full resize-none bg-transparent px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
            />

            {/* Bottom toolbar row */}
            <div className="flex items-center justify-between px-2 pb-1">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={onFileAttach}
                  className="p-1 rounded-md text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                  title="Attach file"
                >
                  <Icon icon="lucide:paperclip" width={14} height={14} />
                </button>
                <button
                  onClick={onImageAttach}
                  className="p-1 rounded-md text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                  title="Attach image"
                >
                  <Icon icon="lucide:image-plus" width={14} height={14} />
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
        <div className="flex items-center justify-between mt-1">
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
