'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { useGrid, type GridCard, type AiMessage } from '@/context/grid-context'
import { useGateway } from '@/context/gateway-context'

const AI_PROVIDERS = [
  { id: 'auto', label: 'Auto', icon: 'lucide:sparkles' },
  { id: 'anthropic', label: 'Anthropic', icon: 'simple-icons:anthropic' },
  { id: 'openai', label: 'OpenAI', icon: 'simple-icons:openai' },
  { id: 'google', label: 'Gemini', icon: 'simple-icons:googlegemini' },
]

interface Props {
  card: GridCard
}

export function AiCard({ card }: Props) {
  const { updateCard } = useGrid()
  const { status, sendRequest, onEvent } = useGateway()
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sessionKeyRef = useRef(`grid-ai-${card.id}`)
  const messages = card.aiMessages ?? []
  const provider = card.aiProvider ?? 'auto'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamContent])

  useEffect(() => {
    if (status !== 'connected') return
    const unsub = onEvent('chat', (payload: unknown) => {
      const data = payload as Record<string, unknown>
      if (data.sessionKey !== sessionKeyRef.current) return

      const state = (data.state ?? data.type) as string | undefined

      if (state === 'delta') {
        const message = data.message as Record<string, unknown> | undefined
        let text = ''
        if (message) {
          const content = message.content as string | Array<Record<string, unknown>> | undefined
          if (typeof content === 'string') text = content
          else if (Array.isArray(content)) {
            text = content
              .filter((b) => b.type === 'text' || b.type === 'output_text')
              .map((b) => (b.text as string) || '')
              .join('')
          }
        }
        if (!text) text = (data.content as string) ?? ''
        if (text) setStreamContent(prev => prev + text)
      } else if (state === 'final') {
        const message = data.message as Record<string, unknown> | undefined
        let finalText = ''
        if (message) {
          const content = message.content as string | Array<Record<string, unknown>> | undefined
          if (typeof content === 'string') finalText = content
          else if (Array.isArray(content)) {
            finalText = content
              .filter((b) => b.type === 'text' || b.type === 'output_text')
              .map((b) => (b.text as string) || '')
              .join('')
          }
        }
        if (!finalText) finalText = (data.content as string) ?? ''
        setStreamContent(prev => {
          const text = finalText || prev
          if (text) {
            const msg: AiMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: text,
              timestamp: Date.now(),
            }
            updateCard(card.id, { aiMessages: [...messages, msg] })
          }
          return ''
        })
        setStreaming(false)
      } else if (state === 'error' || state === 'aborted') {
        setStreamContent(prev => {
          const errorContent = prev || (state === 'error' ? 'An error occurred.' : 'Response was cancelled.')
          if (errorContent) {
            const msg: AiMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: errorContent,
              timestamp: Date.now(),
            }
            updateCard(card.id, { aiMessages: [...messages, msg] })
          }
          return ''
        })
        setStreaming(false)
      }
    })
    return unsub
  }, [status, onEvent, card.id, messages, updateCard, streamContent])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming || status !== 'connected') return

    const userMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    const updated = [...messages, userMsg]
    updateCard(card.id, { aiMessages: updated })
    setInput('')
    setStreaming(true)
    setStreamContent('')

    try {
      await sendRequest('chat.send', {
        sessionKey: sessionKeyRef.current,
        message: text,
        idempotencyKey: crypto.randomUUID(),
      })
    } catch {
      setStreaming(false)
    }
  }, [input, streaming, status, messages, card.id, updateCard, sendRequest])

  return (
    <div className="flex flex-col h-full">
      {/* Provider selector */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)]">
        {AI_PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => updateCard(card.id, { aiProvider: p.id })}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
              provider === p.id
                ? 'bg-[var(--brand)] text-[var(--brand-contrast)]'
                : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Icon icon={p.icon} width={11} height={11} />
            {p.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-auto px-3 py-2 space-y-2">
        {messages.length === 0 && !streaming && (
          <div className="flex items-center justify-center h-full text-[var(--text-disabled)] text-xs">
            Ask anything...
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`text-[12px] leading-relaxed ${msg.role === 'user' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${msg.role === 'user' ? 'text-[var(--brand)]' : 'text-[var(--text-disabled)]'}`}>
              {msg.role === 'user' ? 'You' : 'AI'}
            </span>
            <p className="mt-0.5 whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        {streaming && streamContent && (
          <div className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">AI</span>
            <p className="mt-0.5 whitespace-pre-wrap">{streamContent}<span className="animate-pulse">|</span></p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-[var(--border)] p-2">
        <div className="flex items-center gap-1.5">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={status === 'connected' ? 'Type a message...' : 'Connect gateway to chat'}
            disabled={status !== 'connected'}
            className="flex-1 text-[12px] bg-[var(--bg)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--border-focus)] placeholder:text-[var(--text-disabled)] disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming || status !== 'connected'}
            className="p-1.5 rounded-lg bg-[var(--brand)] text-[var(--brand-contrast)] disabled:opacity-50 hover:brightness-110 transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            <Icon icon={streaming ? 'lucide:loader-2' : 'lucide:arrow-up'} width={14} height={14} className={streaming ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
    </div>
  )
}
