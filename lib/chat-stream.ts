/**
 * Chat stream handler — processes gateway chat events (delta, final, error, aborted, tool_use).
 * Extracted from agent-panel.tsx for testability and separation of concerns.
 */

import { parseEditProposals, type EditProposal } from '@/lib/edit-parser'
import { parsePlanSteps, isPlanContent } from '@/lib/plan-parser'
import { diffEngine } from '@/lib/streaming-diff'
import { emit } from '@/lib/events'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  type?: 'text' | 'edit' | 'error' | 'tool' | 'status' | 'cancelled' | 'plan'
  content: string
  timestamp: number
  editProposals?: EditProposal[]
  planSteps?: import('@/lib/plan-parser').ParsedPlanStep[]
  images?: Array<{ name: string; dataUrl: string }>
}

export interface StreamState {
  sentKeys: Set<string>
  handledKeys: Set<string>
  lastFinal: { content: string; ts: number } | null
  sessionKey: string
  isSending: boolean
}

interface StreamCallbacks {
  setStreamBuffer: React.Dispatch<React.SetStateAction<string>>
  setIsStreaming: (v: boolean) => void
  setSending: (v: boolean) => void
  setThinkingTrail: React.Dispatch<React.SetStateAction<string[]>>
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setAgentActivities?: React.Dispatch<React.SetStateAction<import('@/lib/agent-activity').AgentActivity[]>>
  getFile: (path: string) => { content: string } | undefined
}

function debugLog(message: string, meta?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  if (meta) {
    console.debug('[knot-chat]', message, meta)
  } else {
    console.debug('[knot-chat]', message)
  }
}

function extractText(message: unknown): string {
  if (!message) return ''
  if (typeof message === 'string') return message
  if (typeof message !== 'object') return ''
  const msg = message as Record<string, unknown>
  const content = msg.content as string | Array<Record<string, unknown>> | undefined
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === 'text' || b.type === 'output_text')
      .map((b) => (b.text as string) || '')
      .join('')
  }
  if (typeof msg.text === 'string') return msg.text
  if (typeof msg.output_text === 'string') return msg.output_text
  return ''
}

function extractEventText(payload: Record<string, unknown>): string {
  const fromMessage = extractText(payload.message)
  if (fromMessage) return fromMessage
  if (typeof payload.reply === 'string') return payload.reply
  if (typeof payload.text === 'string') return payload.text
  if (typeof payload.content === 'string') return payload.content
  if (typeof payload.delta === 'string') return payload.delta
  return ''
}

export function handleChatEvent(
  payload: unknown,
  state: StreamState,
  callbacks: StreamCallbacks,
): void {
  const p = payload as Record<string, unknown>
  const eventState = p.state as string | undefined
  const idempotencyKey = (p.idempotencyKey ?? p.idempotency_key ?? p.idemKey) as string | undefined
  const eventSessionKey = (p.sessionKey ??
    p.session_key ??
    (typeof p.session === 'object' && p.session !== null
      ? (p.session as Record<string, unknown>).key
      : undefined)) as string | undefined

  // Ignore inline-completion traffic
  if (idempotencyKey?.startsWith('completion-')) return

  // Match by idempotency key OR session key
  const matchesIdem = !!(idempotencyKey && state.sentKeys.has(idempotencyKey))
  const isReplyEvent =
    eventState === 'delta' ||
    eventState === 'final' ||
    eventState === 'error' ||
    eventState === 'aborted' ||
    eventState === 'tool_use' ||
    eventState === 'tool_start'
  // Session-key match: accept reply events for our session even if sentKeys was lost (HMR)
  const matchesSession = eventSessionKey === state.sessionKey && (state.isSending || isReplyEvent)
  if (!matchesIdem && !matchesSession) {
    debugLog('Ignoring unrelated chat event', {
      eventState,
      idempotencyKey,
      eventSessionKey,
      sessionKey: state.sessionKey,
      isSending: state.isSending,
    })
    return
  }

  // Tool use events → thinking trail
  if (eventState === 'tool_use' || eventState === 'tool_start') {
    const toolName = (p.toolName as string) || (p.name as string) || ''
    const toolInput = p.input as Record<string, unknown> | undefined
    if (toolName) {
      let step = toolName
      if (toolName === 'read' || toolName === 'Read') {
        const path = (toolInput?.path || toolInput?.file_path || '') as string
        step = `Reading ${path.split('/').pop() || path}`
      } else if (toolName.includes('search') || toolName === 'Grep') {
        step = `Searching ${(toolInput?.query as string)?.slice(0, 30) || 'files'}`
      } else if (
        toolName === 'write' ||
        toolName === 'Write' ||
        toolName === 'edit' ||
        toolName === 'Edit'
      ) {
        const path = (toolInput?.path || toolInput?.file_path || '') as string
        step = `Editing ${path.split('/').pop() || path}`
      } else if (toolName.includes('exec') || toolName === 'Bash') {
        step = 'Running command'
      }
      callbacks.setThinkingTrail((prev) => [...prev.slice(-5), step])
      callbacks.setIsStreaming(true)
      // Track structured activity
      if (callbacks.setAgentActivities) {
        import('@/lib/agent-activity').then(({ parseToolActivity }) => {
          const activity = parseToolActivity(toolName, toolInput as Record<string, unknown> | undefined)
          callbacks.setAgentActivities!((prev) => [...prev, activity])
        })
      }
    }
    return
  }

  if (eventState === 'delta') {
    const text = extractEventText(p)
    if (text) {
      callbacks.setStreamBuffer((prev) => {
        if (!prev) return text
        // Some gateways stream cumulative buffers; others stream chunks.
        if (text.startsWith(prev)) return text
        if (prev.endsWith(text)) return prev
        return prev + text
      })
      callbacks.setIsStreaming(true)
      debugLog('Streaming delta received', {
        length: text.length,
        idempotencyKey,
        eventSessionKey,
      })
      // Extract thinking trail from streamed content
      const trailPatterns = [
        {
          re: /Reading\s+`([^`]+)`/g,
          fmt: (m: RegExpExecArray) => `Reading ${m[1].split('/').pop()}`,
        },
        {
          re: /searching\s+(?:for\s+)?["']([^"']+)["']/gi,
          fmt: (m: RegExpExecArray) => `Searching "${m[1]}"`,
        },
        {
          re: /(?:Exploring|Looking at|Checking)\s+`?([^`\n]+)`?/gi,
          fmt: (m: RegExpExecArray) => `Exploring ${m[1].split('/').pop()}`,
        },
        {
          re: /(?:Creating|Writing|Editing)\s+`([^`]+)`/g,
          fmt: (m: RegExpExecArray) => `Editing ${m[1].split('/').pop()}`,
        },
      ]
      for (const { re, fmt } of trailPatterns) {
        let match
        while ((match = re.exec(text)) !== null) {
          const step = fmt(match)
          callbacks.setThinkingTrail((prev) =>
            prev.includes(step) ? prev : [...prev.slice(-4), step],
          )
        }
      }
    }
  } else if (eventState === 'final') {
    callbacks.setThinkingTrail([])
    const finalText = extractEventText(p)
    debugLog('Final chat event received', {
      length: finalText.length,
      idempotencyKey,
      eventSessionKey,
    })

    if (idempotencyKey) {
      state.sentKeys.delete(idempotencyKey)
      if (state.handledKeys.has(idempotencyKey)) return
      state.handledKeys.add(idempotencyKey)
      setTimeout(() => state.handledKeys.delete(idempotencyKey), 10000)
    }

    callbacks.setStreamBuffer((prev) => {
      const text = finalText || prev || ''
      if (text && !/^NO_REPLY$/i.test(text.trim())) {
        // Dedupe: skip if identical content arrived within 8s
        const now = Date.now()
        const last = state.lastFinal
        if (last && last.content === text && now - last.ts < 8000) {
          return ''
        }
        state.lastFinal = { content: text, ts: now }

        const editProposals = parseEditProposals(text)
        if (editProposals.length > 0) {
          for (const proposal of editProposals) {
            const existing = callbacks.getFile(proposal.filePath)
            diffEngine.registerOriginal(proposal.filePath, existing?.content ?? '')
            diffEngine.updateProposed(proposal.filePath, proposal.content)
            diffEngine.finalize(proposal.filePath)
          }
          diffEngine.finalizeAll()
          emit('show-inline-diff', { proposals: editProposals })
        }
        const planSteps = isPlanContent(text) ? parsePlanSteps(text) : undefined
        const msgType = editProposals.length > 0
          ? ('edit' as const)
          : planSteps
            ? ('plan' as const)
            : ('text' as const)
        callbacks.setMessages((msgs) => [
          ...msgs,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            type: msgType,
            content: text,
            timestamp: Date.now(),
            editProposals: editProposals.length > 0 ? editProposals : undefined,
            planSteps,
          },
        ])
        emit('agent-reply')
      } else {
        debugLog('Final chat event had no assistant text', {
          idempotencyKey,
          hadBuffer: Boolean(prev),
        })
      }
      return ''
    })
    callbacks.setIsStreaming(false)
    callbacks.setSending(false)
  } else if (eventState === 'error') {
    callbacks.setThinkingTrail([])
    const errorMsg = (p.errorMessage as string) || 'Unknown error'
    debugLog('Chat stream error event', {
      idempotencyKey,
      eventSessionKey,
      error: errorMsg,
    })
    if (idempotencyKey) state.sentKeys.delete(idempotencyKey)
    callbacks.setStreamBuffer('')
    callbacks.setMessages((msgs) => [
      ...msgs,
      {
        id: crypto.randomUUID(),
        role: 'system' as const,
        type: 'error' as const,
        content: 'Error: ' + errorMsg,
        timestamp: Date.now(),
      },
    ])
    callbacks.setIsStreaming(false)
    callbacks.setSending(false)
  } else if (eventState === 'aborted') {
    callbacks.setThinkingTrail([])
    debugLog('Chat stream aborted event', {
      idempotencyKey,
      eventSessionKey,
    })
    if (idempotencyKey) state.sentKeys.delete(idempotencyKey)
    callbacks.setStreamBuffer((prev) => {
      if (prev) {
        callbacks.setMessages((msgs) => [
          ...msgs,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            type: 'cancelled' as const,
            content: prev + ' [cancelled]',
            timestamp: Date.now(),
          },
        ])
      }
      return ''
    })
    callbacks.setIsStreaming(false)
    callbacks.setSending(false)
  }
}
