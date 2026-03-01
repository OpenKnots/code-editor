/**
 * Monaco InlineCompletionsProvider powered by OpenClaw gateway.
 *
 * Sends surrounding code context to the agent and returns
 * ghost-text suggestions that the user accepts with Tab.
 */

import type { editor, languages, CancellationToken, Position } from 'monaco-editor'

interface GatewaySend {
  (method: string, params: Record<string, unknown>): Promise<unknown>
}

const SESSION_KEY = 'agent:main:code-editor'
const DEBOUNCE_MS = 600
const MAX_CONTEXT_LINES = 15
const MAX_COMPLETION_CHARS = 500

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function createInlineCompletionsProvider(
  gatewaySend: GatewaySend
): languages.InlineCompletionsProvider {
  return {
    provideInlineCompletions: async (
      model: editor.ITextModel,
      position: Position,
      _context: languages.InlineCompletionContext,
      token: CancellationToken
    ): Promise<languages.InlineCompletions> => {
      // Clear any pending debounce
      if (debounceTimer) clearTimeout(debounceTimer)

      // Debounce — wait for user to pause typing
      const result = await new Promise<languages.InlineCompletions>((resolve) => {
        debounceTimer = setTimeout(async () => {
          if (token.isCancellationRequested) {
            resolve({ items: [] })
            return
          }

          try {
            const completion = await getCompletion(model, position, gatewaySend, token)
            if (!completion || token.isCancellationRequested) {
              resolve({ items: [] })
              return
            }

            resolve({
              items: [{
                insertText: completion,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              }],
            })
          } catch {
            resolve({ items: [] })
          }
        }, DEBOUNCE_MS)
      })

      return result
    },

    disposeInlineCompletions: () => {},
  }
}

async function getCompletion(
  model: editor.ITextModel,
  position: Position,
  gatewaySend: GatewaySend,
  token: CancellationToken
): Promise<string | null> {
  const totalLines = model.getLineCount()
  const startLine = Math.max(1, position.lineNumber - MAX_CONTEXT_LINES)
  const endLine = Math.min(totalLines, position.lineNumber + 5)

  // Build context: lines before cursor + current line up to cursor
  const linesBefore = model.getLinesContent()
    .slice(startLine - 1, position.lineNumber - 1)
    .join('\n')
  const currentLine = model.getLineContent(position.lineNumber)
    .substring(0, position.column - 1)
  const linesAfter = model.getLinesContent()
    .slice(position.lineNumber, endLine)
    .join('\n')

  const filePath = model.uri.path.replace(/^\//, '')
  const language = model.getLanguageId()

  const prompt = [
    `[COMPLETION REQUEST]`,
    `File: ${filePath} (${language})`,
    `Line: ${position.lineNumber}, Column: ${position.column}`,
    ``,
    `Code before cursor:`,
    '```',
    linesBefore,
    currentLine,
    '```',
    ``,
    `Code after cursor:`,
    '```',
    linesAfter,
    '```',
    ``,
    `Continue the code from the cursor position. Output ONLY the completion text (no explanation, no markdown, no code fences). Keep it short (1-3 lines max). If no good completion, respond with exactly: [NO_COMPLETION]`,
  ].join('\n')

  try {
    const response = await gatewaySend('chat.send', {
      sessionKey: SESSION_KEY,
      message: prompt,
      idempotencyKey: `completion-${Date.now()}`,
    }) as { reply?: string; text?: string } | null

    if (token.isCancellationRequested) return null

    const text = (response as Record<string, string>)?.reply
      ?? (response as Record<string, string>)?.text
      ?? ''

    if (!text || text.includes('[NO_COMPLETION]') || text.trim().length === 0) {
      return null
    }

    // Clean up the response — strip markdown fences if the model added them
    let cleaned = text
      .replace(/^```[\w]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    // Cap length
    if (cleaned.length > MAX_COMPLETION_CHARS) {
      cleaned = cleaned.substring(0, MAX_COMPLETION_CHARS)
    }

    return cleaned || null
  } catch {
    return null
  }
}
