/**
 * Cross-session chat input history.
 * Persists to localStorage for recall across app restarts.
 */

const STORAGE_KEY = 'code-editor:chat-history'
const MAX_ENTRIES = 50

export function getChatHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function addChatHistory(text: string): void {
  const trimmed = text.trim()
  if (!trimmed) return
  try {
    const history = getChatHistory()
    // Remove duplicate if exists
    const filtered = history.filter(h => h !== trimmed)
    // Add to front (most recent first)
    filtered.unshift(trimmed)
    // Trim to max
    if (filtered.length > MAX_ENTRIES) filtered.length = MAX_ENTRIES
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch {}
}

export function clearChatHistory(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

/**
 * Hook-friendly history navigator.
 * Returns [current, goUp, goDown, reset].
 */
export class HistoryNavigator {
  private history: string[] = []
  private index = -1
  private draft = ''

  load() {
    this.history = getChatHistory()
    this.index = -1
    this.draft = ''
  }

  setDraft(text: string) {
    if (this.index === -1) this.draft = text
  }

  up(): string | null {
    if (this.history.length === 0) return null
    if (this.index < this.history.length - 1) {
      this.index++
      return this.history[this.index]
    }
    return null
  }

  down(): string | null {
    if (this.index <= 0) {
      this.index = -1
      return this.draft
    }
    this.index--
    return this.history[this.index]
  }

  reset() {
    this.index = -1
    this.draft = ''
  }
}
