/**
 * Parse agent responses to detect code edit proposals.
 *
 * Supported formats:
 *   1. Fenced code block with file path header:
 *      ```path/to/file.ts
 *      <code>
 *      ```
 *
 *   2. Edit markers:
 *      [EDIT path/to/file.ts]
 *      ```
 *      <code>
 *      ```
 *
 *   3. Multiple edits in one response (any combination of above)
 */

export interface EditProposal {
  filePath: string
  content: string
  /** Range of characters in the original message that this edit spans */
  sourceRange: [number, number]
}

const EDIT_MARKER_RE = /\[EDIT\s+([^\]]+)\]\s*```[^\n]*\n([\s\S]*?)```/g
const FENCED_WITH_PATH_RE = /```(\S+\.\w+)\n([\s\S]*?)```/g

export function parseEditProposals(text: string): EditProposal[] {
  const proposals: EditProposal[] = []
  const seen = new Set<string>()

  // Try [EDIT path] format first (more explicit)
  for (const match of text.matchAll(EDIT_MARKER_RE)) {
    const filePath = match[1]!.trim()
    const content = match[2]!
    const key = `${filePath}:${match.index}`
    if (!seen.has(key)) {
      seen.add(key)
      proposals.push({
        filePath,
        content,
        sourceRange: [match.index!, match.index! + match[0].length],
      })
    }
  }

  // Try ```path.ext format
  for (const match of text.matchAll(FENCED_WITH_PATH_RE)) {
    const filePath = match[1]!.trim()
    const content = match[2]!

    // Skip if it looks like a language tag rather than a file path
    if (!filePath.includes('/') && !filePath.includes('.')) continue
    // Skip if already captured by EDIT marker
    const overlaps = proposals.some(
      p => match.index! >= p.sourceRange[0] && match.index! <= p.sourceRange[1]
    )
    if (overlaps) continue

    const key = `${filePath}:${match.index}`
    if (!seen.has(key)) {
      seen.add(key)
      proposals.push({
        filePath,
        content,
        sourceRange: [match.index!, match.index! + match[0].length],
      })
    }
  }

  return proposals
}

export function hasEditProposals(text: string): boolean {
  return EDIT_MARKER_RE.test(text) || FENCED_WITH_PATH_RE.test(text)
}
