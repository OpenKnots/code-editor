/**
 * Typed event bus — replaces raw window.dispatchEvent/addEventListener
 * with discoverable, type-safe events.
 */

import type { EditProposal } from '@/lib/edit-parser'

// ─── Event definitions ───────────────────────────────────

export interface AppEvents {
  // Navigation
  'open-folder': void
  'open-recent': { path: string }
  'open-settings': void
  'open-onboarding': void
  'open-git-panel': void
  'open-changes-panel': void
  'open-side-chat': void

  // Focus
  'focus-tree': void
  'focus-editor': void
  'focus-terminal': void
  'focus-agent-input': void

  // File operations
  'file-select': { path: string; sha?: string; content?: string }
  'save-file': { path: string }

  // Editor
  'show-inline-diff': { proposals: EditProposal[] }
  'set-agent-input': { text: string }
  'add-to-chat': { path: string; content: string; startLine: number; endLine: number }
  'inline-edit-request': {
    filePath: string
    instruction: string
    selectedText: string
    startLine: number
    endLine: number
  }

  // Agent / streaming
  'agent-reply': void
  'engine-status': { running: boolean }

  // Git
  'agent-commit': { message: string }
  'agent-commit-result': { success: boolean; fileCount?: number; error?: string }
  'agent-push': void
  'agent-push-result': { success: boolean; error?: string }

  // Preview
  'preview-refresh': void
}

// ─── Typed wrappers ──────────────────────────────────────

type EventDetail<K extends keyof AppEvents> = AppEvents[K]

/**
 * Emit a typed app event.
 */
export function emit<K extends keyof AppEvents>(
  event: K,
  ...args: EventDetail<K> extends void ? [] : [EventDetail<K>]
): void {
  const detail = args[0]
  window.dispatchEvent(
    detail !== undefined ? new CustomEvent(event, { detail }) : new CustomEvent(event),
  )
}

/**
 * Listen for a typed app event. Returns an unsubscribe function.
 */
export function on<K extends keyof AppEvents>(
  event: K,
  handler: EventDetail<K> extends void ? () => void : (detail: EventDetail<K>) => void,
): () => void {
  const wrapper = (e: Event) => {
    const detail = (e as CustomEvent).detail
    ;(handler as (detail?: unknown) => void)(detail)
  }
  window.addEventListener(event, wrapper)
  return () => window.removeEventListener(event, wrapper)
}
