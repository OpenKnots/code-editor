'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { KnotLogo } from '@/components/knot-logo'
import { MarkdownPreview } from '@/components/markdown-preview'
import { PlanView } from '@/components/plan-view'
import type { ParsedPlanStep } from '@/lib/plan-parser'
import { navigateToLine } from '@/lib/line-links'
import { copyToClipboard } from '@/lib/clipboard'
import { useChatAppearance } from '@/context/chat-appearance-context'
import type { ChatMessage } from '@/lib/chat-stream'
import type { EditProposal } from '@/lib/edit-parser'
import { AgentActivityFeed } from '@/components/chat/agent-activity-feed'
import { InlineDiffGroup } from '@/components/chat/inline-diff'

interface MessageListProps {
  messages: ChatMessage[]
  streamBuffer: string
  isStreaming: boolean
  thinkingTrail: string[]
  agentActivities?: import('@/lib/agent-activity').AgentActivity[]
  turnElapsedMs?: number
  agentMode: string
  onShowDiff: (proposal: EditProposal, messageId: string) => void
  onQuickApply: (proposal: EditProposal) => void
  onApplyAll?: (proposals: EditProposal[]) => void
  getFileContent?: (filePath: string) => string | undefined
  onDeleteMessage: (id: string) => void
  onRegenerate: (id: string) => void
  onEditAndResend: (id: string) => void
  onSendMessage: (text?: string) => void
}

// Plan parsing moved to lib/plan-parser.ts

const SYSTEM_PROMPT_SIGNATURES = [
  'You are KnotCode Agent',
  'KnotCode system prompt',
  '[KnotCode system prompt]',
]

function isSystemPromptMessage(msg: { role: string; content: string }): boolean {
  if (msg.role !== 'system' && msg.role !== 'assistant') return false
  const c = msg.content.slice(0, 120)
  return SYSTEM_PROMPT_SIGNATURES.some((sig) => c.includes(sig))
}

/** Estimate token count from content length */
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4)
}

type UserAttachmentChip = {
  kind: 'file' | 'selection'
  path: string
  title: string
  detail: string
}

function getFileTypeIcon(path: string, kind: UserAttachmentChip['kind']): string {
  if (kind === 'selection') return 'lucide:text-cursor-input'

  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'py':
    case 'rs':
    case 'go':
    case 'java':
    case 'cpp':
    case 'c':
      return 'lucide:file-code-2'
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
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return 'lucide:image'
    default:
      return 'lucide:file-text'
  }
}

function parseUserAttachmentPreview(content: string): {
  text: string
  chips: UserAttachmentChip[]
} {
  const match = content.match(/^\[([^\]]*(?:📄|📝|🖼)[^\]]*)\]\n?/)
  if (!match) return { text: content, chips: [] }

  const chips: UserAttachmentChip[] = []
  for (const token of match[1].split(' · ').map((item) => item.trim())) {
    if (!token || token.startsWith('🖼 ')) continue

    const kind = token.startsWith('📝 ') ? 'selection' : token.startsWith('📄 ') ? 'file' : null
    if (!kind) continue

    const rawLabel = token.slice(2).trim()
    const detailMatch = rawLabel.match(/^(.*?)(?:\s+\(([^()]+)\))?$/)
    const label = detailMatch?.[1]?.trim() ?? rawLabel
    const parsedDetail = detailMatch?.[2]?.trim() ?? ''

    if (kind === 'selection') {
      const selectionMatch = label.match(/^(.*?):(\d+)-(\d+)$/)
      if (selectionMatch) {
        const [, path, start, end] = selectionMatch
        const startLine = Number.parseInt(start, 10)
        const endLine = Number.parseInt(end, 10)
        const fileName = path.split('/').pop() || path
        const lineCount = Math.max(1, endLine - startLine + 1)
        chips.push({
          kind,
          path,
          title: `${fileName}:${startLine}-${endLine}`,
          detail: parsedDetail || `${lineCount} line${lineCount === 1 ? '' : 's'} selected`,
        })
        continue
      }
    }

    chips.push({
      kind,
      path: label,
      title: label.split('/').pop() || label,
      detail: parsedDetail || 'Attached file',
    })
  }

  return {
    text: content.slice(match[0].length),
    chips,
  }
}

/** Get tool step icon */
function getToolIcon(step: string): string {
  if (step.startsWith('Reading')) return 'lucide:file-text'
  if (step.startsWith('Searching')) return 'lucide:search'
  if (step.startsWith('Exploring')) return 'lucide:folder-open'
  if (step.startsWith('Editing') || step.startsWith('Writing')) return 'lucide:pencil'
  if (step.startsWith('Running') || step.startsWith('Executing')) return 'lucide:terminal'
  if (step.startsWith('Creating')) return 'lucide:plus'
  if (step.startsWith('Analyzing')) return 'lucide:scan'
  return 'lucide:sparkles'
}

/** Collapsible message wrapper for long content */
function CollapsibleMessage({ content, children }: { content: string; children: React.ReactNode }) {
  const lineCount = content.split('\n').length
  const [collapsed, setCollapsed] = useState(lineCount > 20)
  const shouldCollapse = lineCount > 20

  if (!shouldCollapse) return <>{children}</>

  return (
    <div className={`message-collapse-fade ${collapsed ? 'collapsed' : ''}`}>
      {children}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] shadow-sm transition-colors cursor-pointer"
        >
          <Icon icon="lucide:chevron-down" width={11} height={11} />
          Show more
        </button>
      )}
    </div>
  )
}

export function MessageList({
  messages,
  streamBuffer,
  isStreaming,
  thinkingTrail,
  agentActivities = [],
  turnElapsedMs = 0,
  agentMode,
  onShowDiff,
  onQuickApply,
  onApplyAll,
  getFileContent,
  onDeleteMessage,
  onRegenerate,
  onEditAndResend,
  onSendMessage,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const [showSystemMessages, setShowSystemMessages] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const { chatFontSize, chatFontCss } = useChatAppearance()

  const visibleMessages = useMemo(
    () => messages.filter((m) => !isSystemPromptMessage(m)),
    [messages],
  )

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamBuffer])

  useEffect(() => {
    if (!menuOpenId) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpenId])

  const handleCopy = useCallback((content: string) => {
    copyToClipboard(content)
    setMenuOpenId(null)
  }, [])

  // Compute changes summary for edit proposals
  const editSummaries = useMemo(() => {
    const map = new Map<string, string>()
    for (const msg of messages) {
      if (msg.editProposals && msg.editProposals.length > 0) {
        const files = msg.editProposals.length
        const totalAdded = msg.editProposals.reduce(
          (sum, p) => sum + p.content.split('\n').length,
          0,
        )
        map.set(msg.id, `${files} file${files > 1 ? 's' : ''} · ~${totalAdded} lines`)
      }
    }
    return map
  }, [messages])

  return (
    <>
      {/* Image lightbox */}
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

      {/* Streaming progress bar */}
      {isStreaming && <div className="streaming-progress-bar shrink-0" />}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0 scroll-shadow"
        onScroll={(e) => {
          const el = e.currentTarget
          el.classList.toggle('has-scroll-top', el.scrollTop > 8)
          el.classList.toggle(
            'has-scroll-bottom',
            el.scrollTop + el.clientHeight < el.scrollHeight - 8,
          )
        }}
      >
        {visibleMessages.map((msg, idx) => {
          const t = msg.type ?? 'text'
          const isUser = msg.role === 'user'
          const isSystem = msg.role === 'system'
          const isAssistant = msg.role === 'assistant'

          // Hide system status/tool messages by default (errors always show)
          if (isSystem && !showSystemMessages && t !== 'error') return null

          // Check if previous message is from the same sender for grouping
          const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null
          const isGrouped = prevMsg && prevMsg.role === msg.role && !(prevMsg.type === 'error' || t === 'error')

          const bubbleClass = isUser
            ? 'bg-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[var(--text-primary)] rounded-br-sm'
            : t === 'error'
              ? 'px-2.5 py-1.5 text-[10px] border-l-2 border-[var(--color-deletions,#ef4444)] bg-[color-mix(in_srgb,var(--color-deletions,#ef4444)_8%,transparent)] text-[var(--text-secondary)]'
              : t === 'tool'
                ? 'px-2.5 py-1 text-[10px] border-l-2 border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,transparent)] text-[var(--text-secondary)]'
                : t === 'status'
                  ? 'px-2.5 py-1 text-[10px] bg-[color-mix(in_srgb,var(--text-disabled)_6%,transparent)] text-[var(--text-tertiary)]'
                  : t === 'cancelled'
                    ? 'bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-bl-sm opacity-60'
                    : isSystem
                      ? 'px-2.5 py-1.5 text-[10px] border-l-2 border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,transparent)] text-[var(--text-secondary)]'
                      : t === 'edit'
                        ? 'bg-[var(--bg-subtle)] border border-[color-mix(in_srgb,var(--color-additions,#22c55e)_25%,var(--border))] text-[var(--text-primary)] rounded-bl-sm'
                        : 'bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-bl-sm'

          const typeIcon =
            t === 'error'
              ? 'lucide:alert-circle'
              : t === 'tool'
                ? 'lucide:wrench'
                : t === 'status'
                  ? 'lucide:info'
                  : t === 'cancelled'
                    ? 'lucide:circle-slash'
                    : t === 'edit' && isAssistant
                      ? 'lucide:file-diff'
                      : null
          const userPreview = isUser ? parseUserAttachmentPreview(msg.content) : null

          return (
            <div
              key={msg.id}
              className={`group/msg flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full animate-fade-in-up`}
              style={{ animationDuration: '0.2s', marginTop: isGrouped ? '4px' : '12px' }}
            >
              {/* Assistant avatar row */}
              {isAssistant && !isGrouped && (
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="message-avatar-ring">
                    <KnotLogo size={12} className="text-[var(--brand)]" />
                  </div>
                  <span className="text-[10px] font-medium text-[var(--text-tertiary)]">Knot</span>
                </div>
              )}

              <div className={`relative min-w-0 ${isUser ? 'max-w-[85%]' : 'w-full'}`}>
                {/* Ellipsis menu trigger */}
                <button
                  onClick={() => setMenuOpenId((prev) => (prev === msg.id ? null : msg.id))}
                  className={`absolute ${isUser ? '-left-5' : '-right-5'} top-0.5 p-0.5 rounded text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-all cursor-pointer ${menuOpenId === msg.id ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100'}`}
                >
                  <Icon icon="lucide:ellipsis" width={13} height={13} />
                </button>

                {/* Context menu */}
                {menuOpenId === msg.id && (
                  <div
                    ref={menuRef}
                    className={`absolute ${isUser ? 'right-0' : 'left-0'} top-6 z-50 w-44 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-xl py-1 animate-fade-in`}
                    style={{ animationDuration: '0.1s' }}
                  >
                    <button
                      onClick={() => handleCopy(msg.content)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                    >
                      <Icon icon="lucide:copy" width={12} height={12} /> Copy message
                    </button>
                    {isAssistant && (
                      <button
                        onClick={() => {
                          setMenuOpenId(null)
                          onRegenerate(msg.id)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                      >
                        <Icon icon="lucide:refresh-cw" width={12} height={12} /> Regenerate
                      </button>
                    )}
                    {isUser && (
                      <button
                        onClick={() => {
                          setMenuOpenId(null)
                          onEditAndResend(msg.id)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                      >
                        <Icon icon="lucide:pencil" width={12} height={12} /> Edit & resend
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setMenuOpenId(null)
                        onDeleteMessage(msg.id)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-deletions,#ef4444)] hover:bg-[color-mix(in_srgb,var(--color-deletions,#ef4444)_6%,transparent)] transition-colors cursor-pointer"
                    >
                      <Icon icon="lucide:trash-2" width={12} height={12} /> Delete
                    </button>
                  </div>
                )}

                {/* Message bubble */}
                <div
                  className={`rounded-xl px-3 py-2 leading-relaxed ${bubbleClass}`}
                  style={
                    isUser || isAssistant
                      ? { fontSize: `${chatFontSize}px`, fontFamily: chatFontCss }
                      : undefined
                  }
                >
                  {(t === 'tool' || t === 'status' || t === 'error') && typeIcon && (
                    <span className="inline-flex items-center gap-1 mr-1 align-middle">
                      <Icon
                        icon={typeIcon}
                        width={11}
                        height={11}
                        className={
                          t === 'error'
                            ? 'text-[var(--color-deletions,#ef4444)]'
                            : 'text-[var(--text-disabled)]'
                        }
                      />
                    </span>
                  )}
                  {t === 'cancelled' && (
                    <span className="inline-flex items-center gap-1 mr-1 align-middle text-[var(--text-disabled)]">
                      <Icon icon="lucide:circle-slash" width={11} height={11} />
                    </span>
                  )}
                  {isUser ? (
                    <div>
                      {userPreview && userPreview.chips.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {userPreview.chips.map((chip, chipIdx) => (
                            <div
                              key={`${chip.path}-${chipIdx}`}
                              className="inline-flex max-w-[220px] items-start gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--border)_85%,transparent)] bg-[color-mix(in_srgb,var(--bg)_76%,transparent)] px-2.5 py-1.5"
                            >
                              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-deletions,#ef4444)_12%,transparent)] text-[var(--color-deletions,#ef4444)]">
                                <Icon
                                  icon={getFileTypeIcon(chip.path, chip.kind)}
                                  width={9}
                                  height={9}
                                />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-mono text-[10px] leading-tight text-[var(--text-primary)]">
                                  {chip.title}
                                </span>
                                <span className="block text-[8px] leading-tight text-[var(--text-disabled)]">
                                  {chip.detail}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {msg.images.map((img, imgIdx) => (
                            <div
                              key={imgIdx}
                              className="relative group/msgimg rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-[var(--brand)] transition-all"
                              style={{ width: 96, height: 72 }}
                              onClick={() => setLightboxSrc(img.dataUrl)}
                            >
                              <img
                                src={img.dataUrl}
                                alt={img.name}
                                className="w-full h-full object-cover transition-transform duration-200 group-hover/msgimg:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover/msgimg:opacity-100 transition-opacity flex items-end p-1.5">
                                <span className="text-[8px] text-white/90 font-mono truncate leading-tight">
                                  {img.name}
                                </span>
                              </div>
                              <div className="absolute top-1 right-1 opacity-0 group-hover/msgimg:opacity-100 transition-opacity">
                                <Icon
                                  icon="lucide:zoom-in"
                                  width={10}
                                  height={10}
                                  className="text-white/80 drop-shadow-md"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {userPreview?.text ? (
                        <p className="whitespace-pre-wrap break-words">{userPreview.text}</p>
                      ) : null}
                    </div>
                  ) : isSystem && (t === 'tool' || t === 'status' || t === 'error') ? (
                    <span className="inline">{msg.content}</span>
                  ) : (
                    <CollapsibleMessage content={msg.content}>
                      <div
                        className="prose-chat stagger-paragraph"
                        onClick={(e) => {
                          const target = e.target as HTMLElement
                          const clickText = target.textContent ?? ''
                          const lineMatch =
                            clickText.match(/(?:lines?\s+|L)(\d+)(?:\s*[-–]\s*L?(\d+))?/i) ||
                            clickText.match(/([\w./\-]+\.\w+)[:#]L?(\d+)/)
                          if (lineMatch) {
                            const start = parseInt(lineMatch[1] ?? '', 10)
                            const end = lineMatch[2] ? parseInt(lineMatch[2], 10) : undefined
                            if (!isNaN(start)) {
                              e.preventDefault()
                              navigateToLine(start, end)
                            }
                          }
                        }}
                      >
                        {t === 'edit' && isAssistant && (
                          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] text-[var(--color-additions,#22c55e)] font-medium">
                            <Icon icon="lucide:file-diff" width={12} height={12} />
                            File changes proposed
                            {editSummaries.has(msg.id) && (
                              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-additions,#22c55e)_10%,transparent)] text-[10px]">
                                {editSummaries.get(msg.id)}
                              </span>
                            )}
                          </div>
                        )}
                        <MarkdownPreview content={msg.content} />
                        {isAssistant && msg.type === 'plan' && msg.planSteps && (
                          <PlanView
                            steps={msg.planSteps}
                            interactive={agentMode === 'plan'}
                            onApprove={() => onSendMessage('Execute the plan above. Proceed step by step.')}
                            onReject={() => onSendMessage('I want to modify this plan. Let me explain what to change.')}
                          />
                        )}
                      </div>
                    </CollapsibleMessage>
                  )}
                </div>
              </div>

              {/* Response metadata — time + token estimate on hover */}
              <div className="flex items-center gap-2 mt-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                <span className="text-[9px] text-[var(--text-disabled)] font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {isAssistant && (
                  <span className="text-[9px] text-[var(--text-disabled)] font-mono">
                    ~{estimateTokens(msg.content).toLocaleString()} tokens
                  </span>
                )}
              </div>

              {/* Inline diff review */}
              {msg.editProposals && msg.editProposals.length > 0 && (
                <InlineDiffGroup
                  proposals={msg.editProposals}
                  getOriginal={(filePath) => getFileContent?.(filePath)}
                  onApply={onQuickApply}
                  onApplyAll={() => onApplyAll?.(msg.editProposals!)}
                />
              )}
            </div>
          )
        })}

        {/* Streaming indicator */}
        {isStreaming && (
          <div
            className="flex flex-col items-start animate-fade-in"
            style={{ animationDuration: '0.15s' }}
          >
            {/* Agent activity feed (structured) or inline tool badges (fallback) */}
            {agentActivities.length > 0 && !streamBuffer && (
              <div className="w-full mb-1.5">
                <AgentActivityFeed activities={agentActivities} isRunning={isStreaming} elapsedMs={turnElapsedMs} />
              </div>
            )}
            {agentActivities.length === 0 && thinkingTrail.length > 0 && !streamBuffer && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {thinkingTrail.map((step, i) => {
                  const isLast = i === thinkingTrail.length - 1
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                        isLast
                          ? 'border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] text-[var(--brand)]'
                          : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-disabled)]'
                      }`}
                    >
                      <Icon
                        icon={isLast ? getToolIcon(step) : 'lucide:check'}
                        width={10}
                        height={10}
                      />
                      {step}
                    </span>
                  )
                })}
              </div>
            )}

            {streamBuffer ? (
              <div className="w-full min-w-0">
                {/* Avatar for streaming */}
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="message-avatar-ring">
                    <KnotLogo size={12} className="text-[var(--brand)]" />
                  </div>
                  <span className="text-[10px] font-medium text-[var(--text-tertiary)]">Knot</span>
                </div>
                <div
                  className="rounded-xl px-3 py-2 leading-relaxed bg-[var(--bg-subtle)] border border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] text-[var(--text-primary)] rounded-bl-sm"
                  style={{ fontSize: `${chatFontSize}px`, fontFamily: chatFontCss }}
                >
                  <div className="prose-chat">
                    <MarkdownPreview content={streamBuffer} streaming />
                  </div>
                  <span className="inline-block w-1.5 h-3.5 bg-[var(--brand)] animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 px-3 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] rounded-bl-sm w-full">
                {/* Thinking disclosure (collapsed by default) */}
                {thinkingTrail.length > 0 && (
                  <details className="thinking-disclosure mb-1" open={thinkingOpen}>
                    <summary
                      className="text-[11px] text-[var(--text-tertiary)] select-none"
                      onClick={(e) => {
                        e.preventDefault()
                        setThinkingOpen((v) => !v)
                      }}
                    >
                      <Icon
                        icon="lucide:chevron-right"
                        width={10}
                        height={10}
                        className="thinking-chevron text-[var(--text-disabled)]"
                      />
                      <span>{thinkingTrail.length} operations</span>
                    </summary>
                    <div className="relative flex flex-col gap-0 mt-1 ml-1">
                      <div className="absolute left-[4px] top-1 bottom-1 w-px bg-[color-mix(in_srgb,var(--brand)_20%,transparent)]" />
                      {thinkingTrail.map((step, i) => {
                        const isLast = i === thinkingTrail.length - 1
                        const age = thinkingTrail.length - 1 - i
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-[11px] py-0.5 plan-step-enter"
                            style={{
                              opacity: isLast ? 1 : Math.max(0.3, 1 - age * 0.2),
                              transition: 'all 0.3s ease',
                            }}
                          >
                            <div className="relative z-[1] shrink-0">
                              {isLast ? (
                                <span className="relative flex h-[9px] w-[9px]">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand)] opacity-50" />
                                  <span className="relative inline-flex rounded-full h-[9px] w-[9px] bg-[var(--brand)]" />
                                </span>
                              ) : (
                                <span className="block w-[9px] h-[9px] rounded-full border-2 border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] bg-[var(--bg-subtle)]" />
                              )}
                            </div>
                            <Icon
                              icon={getToolIcon(step)}
                              width={11}
                              height={11}
                              className={`shrink-0 ${isLast ? 'text-[var(--brand)]' : 'text-[var(--text-disabled)]'}`}
                            />
                            <span
                              className={`truncate flex-1 ${isLast ? 'text-[var(--text-secondary)] font-medium' : 'text-[var(--text-disabled)]'}`}
                            >
                              {step}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </details>
                )}
                <div className="flex items-center gap-2">
                  <div className="typing-wave">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="text-[11px] text-[var(--text-tertiary)] shimmer-text">
                    {thinkingTrail.length > 0
                      ? thinkingTrail[thinkingTrail.length - 1]
                      : 'Thinking...'}
                  </span>
                  {turnElapsedMs > 0 && (
                    <span className="text-[9px] text-[var(--text-disabled)] tabular-nums">
                      {turnElapsedMs < 1000 ? '' : `${(turnElapsedMs / 1000).toFixed(0)}s`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Hidden system messages toggle */}
        {(() => {
          const hiddenCount = visibleMessages.filter(
            (m) => m.role === 'system' && (m.type ?? 'text') !== 'error',
          ).length
          if (hiddenCount === 0) return null
          return (
            <button
              onClick={() => setShowSystemMessages((v) => !v)}
              className="mx-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
            >
              <Icon
                icon={showSystemMessages ? 'lucide:eye-off' : 'lucide:eye'}
                width={10}
                height={10}
              />
              {showSystemMessages ? 'Hide' : 'Show'} {hiddenCount} system{' '}
              {hiddenCount === 1 ? 'message' : 'messages'}
            </button>
          )
        })()}
      </div>
    </>
  )
}
