'use client'

import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import DOMPurify from 'dompurify'
import { parse } from 'create-markdown'
import { BlockRenderer } from 'create-markdown/react'
import { copyToClipboard } from '@/lib/clipboard'
import { installAbortErrorSuppression, isAbortError } from '@/lib/abort-error'
import { registerEditorTheme } from '@/lib/monaco-theme'
interface MarkdownPreviewProps {
  content: string
  className?: string
}

const HEADING_MAP: Record<string, string> = {
  h1: '# ',
  h2: '## ',
  h3: '### ',
  h4: '#### ',
  h5: '##### ',
  h6: '###### ',
}

/**
 * Normalize mixed HTML+Markdown content into pure markdown
 * so the block parser can handle it cleanly.
 */
function normalizeToMarkdown(raw: string): string {
  let s = raw

  // Strip HTML comments (single-line and multi-line)
  s = s.replace(/<!--[\s\S]*?-->/g, '')

  // Convert <h1>…</h6> to markdown headings
  s = s.replace(/<(h[1-6])>([\s\S]*?)<\/\1>/gi, (_, tag, inner) => {
    const prefix = HEADING_MAP[tag.toLowerCase()] ?? '### '
    return `\n${prefix}${inner.trim()}\n`
  })

  // <strong> / <b> → **bold**
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**')

  // <em> / <i> → *italic*
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*')

  // <code> → `code`
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')

  // <pre> wrapping <code> → fenced code block
  s = s.replace(
    /<pre>\s*<code(?:\s+class="language-(\w+)")?>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (_, lang, code) => `\n\`\`\`${lang ?? ''}\n${decodeHtmlEntities(code.trim())}\n\`\`\`\n`,
  )

  // <a href="...">text</a> → [text](href)
  s = s.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')

  // <br> / <br/> → newline
  s = s.replace(/<br\s*\/?>/gi, '\n')

  // <hr> / <hr/> → ---
  s = s.replace(/<hr\s*\/?>/gi, '\n---\n')

  // <sub>…</sub> / <sup>…</sup> → plain text (no markdown equivalent)
  s = s.replace(/<\/?(sub|sup)>/gi, '')

  // <p>…</p> → unwrap into paragraphs
  s = s.replace(/<p>([\s\S]*?)<\/p>/gi, '\n$1\n')

  // <blockquote>…</blockquote> → > quoted
  s = s.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    return (
      inner
        .trim()
        .split('\n')
        .map((line: string) => `> ${line}`)
        .join('\n') + '\n'
    )
  })

  // <ul>/<ol> with <li> → markdown lists
  s = s.replace(/<ul>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    return inner.replace(/<li>([\s\S]*?)<\/li>/gi, '- $1\n').trim() + '\n'
  })
  s = s.replace(/<ol>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let idx = 0
    return inner.replace(/<li>([\s\S]*?)<\/li>/gi, () => `${++idx}. `) + '\n'
  })

  // <img src="..." alt="..."> → ![alt](src)
  s = s.replace(/<img\s+[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
  s = s.replace(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)')

  // Strip any remaining HTML tags
  s = s.replace(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi, '')

  // Decode common HTML entities
  s = decodeHtmlEntities(s)

  // Convert @mentions to GitHub profile links (avoid matching inside emails)
  s = s.replace(
    /(^|[\s(])@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\b/gm,
    '$1[@$2](https://github.com/$2)',
  )

  // Collapse 3+ consecutive blank lines to 2
  s = s.replace(/\n{3,}/g, '\n\n')

  return s.trim()
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

const MENTION_HREF_RE = /^https:\/\/github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)$/

let markdownMonacoPromise: Promise<Awaited<ReturnType<typeof import('@monaco-editor/loader').default.init>>> | null =
  null

async function getMarkdownMonaco() {
  if (!markdownMonacoPromise) {
    markdownMonacoPromise = import('@monaco-editor/loader').then(({ default: loader }) =>
      loader.init(),
    )
  }
  return markdownMonacoPromise
}

installAbortErrorSuppression()

type HoverTarget =
  | { kind: 'mention'; login: string; rect: DOMRect }
  | { kind: 'link'; url: string; rect: DOMRect }

function classifyLink(el: HTMLElement): HoverTarget | null {
  const anchor = el.closest?.('a') as HTMLAnchorElement | null
  if (!anchor) return null
  const href = anchor.getAttribute('href') ?? ''
  const text = anchor.textContent ?? ''

  if (text.startsWith('@')) {
    const m = href.match(MENTION_HREF_RE)
    if (m) return { kind: 'mention', login: m[1], rect: anchor.getBoundingClientRect() }
  }

  if (/^https?:\/\//.test(href)) {
    return { kind: 'link', url: href, rect: anchor.getBoundingClientRect() }
  }

  return null
}

function FloatingCard({
  target,
  onMouseEnter,
  onMouseLeave,
}: {
  target: HoverTarget
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const width = target.kind === 'link' ? 320 : 280
  const above = target.rect.top > 300
  const top = above ? target.rect.top - 8 : target.rect.bottom + 8
  const left = Math.min(
    target.rect.left,
    (typeof window !== 'undefined' ? window.innerWidth : 1200) - width - 16,
  )

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top,
        left: Math.max(8, left),
        width,
        transform: above ? 'translateY(-100%)' : 'none',
        zIndex: 9999,
      }}
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-lg animate-fade-in"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {target.kind === 'mention' ? null : null}
    </div>,
    document.body,
  )
}

export function MarkdownPreview({ content, className, streaming }: MarkdownPreviewProps & { streaming?: boolean }) {
  // Debounce parsing during streaming — parse at most every 150ms
  const lastParsedRef = useRef('')
  const lastBlocksRef = useRef<ReturnType<typeof parse>>([])
  const lastParseTimeRef = useRef(0)

  const blocks = useMemo(() => {
    // During streaming, skip re-parse if content hasn't grown enough or too recent
    if (streaming && lastBlocksRef.current.length > 0) {
      const now = Date.now()
      const timeSince = now - lastParseTimeRef.current
      const growth = content.length - lastParsedRef.current.length
      if (timeSince < 150 && growth < 100) {
        return lastBlocksRef.current
      }
    }

    const clean =
      typeof window !== 'undefined'
        ? DOMPurify.sanitize(content, { ALLOWED_TAGS: [], KEEP_CONTENT: true })
        : content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    const normalized = normalizeToMarkdown(clean)
    const result = parse(normalized)
    lastParsedRef.current = content
    lastBlocksRef.current = result
    lastParseTimeRef.current = Date.now()
    return result
  }, [content, streaming])

  const containerRef = useRef<HTMLDivElement>(null)
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // ─── Syntax highlight code blocks with Monaco ─────────────
  // IMPORTANT: Never reparent <pre> nodes — React owns the DOM tree.
  // Only do in-place style/class changes and insert sibling elements.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let cancelled = false
    const cleanups: (() => void)[] = []

    const highlightCodeBlocks = async () => {
      const blocks = Array.from(el.querySelectorAll<HTMLPreElement>('pre')).filter(
        (pre) => !pre.dataset.highlighted,
      )
      if (!blocks.length) return

      // eslint-disable-next-line no-useless-assignment
      let monaco: Awaited<ReturnType<typeof getMarkdownMonaco>> | null = null
      try {
        monaco = await getMarkdownMonaco()
        if (cancelled) return
        registerEditorTheme(monaco)
        monaco.editor.setTheme('code-editor')
      } catch (error) {
        if (!isAbortError(error)) {
          // Markdown rendering should keep working even if Monaco highlighting fails.
        }
        return
      }

      for (const pre of blocks) {
        if (cancelled || pre.dataset.highlighted) continue
        pre.dataset.highlighted = 'true'

        const code = pre.querySelector('code')
        if (!code) continue

        const langClass = Array.from(code.classList).find((c) => c.startsWith('language-'))
        const lang = langClass?.replace('language-', '') || ''
        const rawText = code.textContent || ''

        if (!rawText.trim()) continue

        // Style the <pre> in-place (no reparenting)
        pre.className =
          'overflow-x-auto p-3 text-[11px] leading-[1.6] font-mono m-0 rounded-b-lg border border-[var(--border)] bg-[var(--bg)]'
        pre.style.marginTop = '0'

        // Insert a header *before* the <pre> as a sibling (not wrapping)
        const header = document.createElement('div')
        header.className =
          'code-block-header flex items-center justify-between h-7 px-3 bg-[var(--bg-secondary)] border border-b-0 border-[var(--border)] rounded-t-lg my-2 mb-0'
        header.innerHTML = `<span class="text-[9px] font-mono text-[var(--text-disabled)] uppercase tracking-wider">${lang || 'code'}</span><button class="copy-btn flex items-center gap-1 text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer" title="Copy code">Copy</button>`

        const copyHandler = () => {
          copyToClipboard(rawText).then((ok) => {
            if (!ok) return
            const btn = header.querySelector('.copy-btn')
            if (btn) {
              btn.textContent = 'Copied!'
              setTimeout(() => {
                if (!cancelled) btn.textContent = 'Copy'
              }, 1500)
            }
          })
        }
        header.querySelector('.copy-btn')?.addEventListener('click', copyHandler)

        pre.parentNode?.insertBefore(header, pre)

        cleanups.push(() => {
          header.querySelector('.copy-btn')?.removeEventListener('click', copyHandler)
          header.remove()
        })

        try {
          const langId =
            lang === 'js'
              ? 'javascript'
              : lang === 'ts'
                ? 'typescript'
                : lang === 'jsx'
                  ? 'javascript'
                  : lang === 'tsx'
                    ? 'typescript'
                    : lang === 'py'
                      ? 'python'
                      : lang === 'sh' || lang === 'bash'
                        ? 'shell'
                        : lang === 'yml'
                          ? 'yaml'
                          : lang || 'plaintext'
          const html = await monaco.editor.colorize(rawText, langId, { tabSize: 2 })
          if (!cancelled) {
            code.innerHTML = html
          }
        } catch (error) {
          if (!isAbortError(error)) {
            // Leave the raw code block intact if highlighting fails.
          }
        }
      }
    }

    void highlightCodeBlocks()

    return () => {
      cancelled = true
      cleanups.forEach((fn) => fn())
    }
  }, [blocks])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.querySelectorAll<HTMLAnchorElement>('a[href^="https://github.com/"]').forEach((a) => {
      if (a.textContent?.startsWith('@') && MENTION_HREF_RE.test(a.getAttribute('href') ?? '')) {
        a.classList.add('mention-link')
      }
    })
  }, [blocks])

  const scheduleClose = useCallback(() => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setHoverTarget(null), 300)
  }, [])

  const cancelClose = useCallback(() => {
    clearTimeout(closeTimer.current)
  }, [])

  const handlePointerOver = useCallback(
    (e: React.PointerEvent) => {
      const target = classifyLink(e.target as HTMLElement)
      if (!target) return
      cancelClose()
      setHoverTarget(target)
    },
    [cancelClose],
  )

  const handlePointerOut = useCallback(
    (e: React.PointerEvent) => {
      const anchor = (e.target as HTMLElement).closest?.('a')
      if (anchor) scheduleClose()
    },
    [scheduleClose],
  )

  return (
    <div
      ref={containerRef}
      className={`md-preview ${className ?? ''}`}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <BlockRenderer blocks={blocks} />
      {hoverTarget && (
        <FloatingCard
          target={hoverTarget}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        />
      )}
    </div>
  )
}
