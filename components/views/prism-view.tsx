'use client'

import { useCallback, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'

const PRISM_BASE_URL = 'https://prism.new'
const DEFAULT_FILE_NAME = 'main.tex'

const PRISM_FILES = [DEFAULT_FILE_NAME, 'diagram.jpg', 'notes.tex']

const DEFAULT_SOURCE = String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath}
\usepackage{graphicx}
\usepackage{booktabs}

\title{What is Prism?}
\author{Prism Team}
\date{}

\begin{document}
\maketitle

\textbf{Prism} is an AI-powered LaTeX editor for writing scientific documents. It supports real-time collaboration with coauthors and includes OpenAI-powered intelligence to help you draft and edit text, reason through ideas, and handle formatting.

\section{Features}

Prism embeds ChatGPT directly in the editor so you can converse with your document as you write:

\begin{itemize}
  \item Add the equation for the Laplace transform of $f(t) = t e^{-2t}$ to the introduction.
  \item Add a 4-by-4 table to the summary section.
  \item Generate a short hand-drawn diagram in TikZ for the relay network.
  \item Track edits and suggest concise revisions for each paragraph.
\end{itemize}

\section{Collaboration}

Invite collaborators by clicking the Share menu. Any edits they make will sync instantly. You can also leave comments by highlighting text and selecting Leave a comment.

\end{document}
`

type PreviewSection = {
  title: string
  paragraphs: string[]
  items: string[]
}

type PreviewModel = {
  title: string
  intro: string
  sections: PreviewSection[]
}

function extractCommandArgument(source: string, command: string) {
  const match = source.match(new RegExp(String.raw`\\${command}\{([^}]*)\}`))
  return match?.[1]?.trim() || ''
}

function normalizeLatexText(input: string) {
  return input
    .replace(/\\(textbf|textit|emph)\{([^}]*)\}/g, '$2')
    .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z*]+(?:\[[^\]]*\])?\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z*]+(?:\[[^\]]*\])?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\$/g, '')
    .replace(/~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildPreviewModel(source: string): PreviewModel {
  const sections: PreviewSection[] = []
  const introParagraphs: string[] = []
  let currentSection: PreviewSection | null = null

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('%')) continue

    const sectionMatch = line.match(/^\\section\{([^}]*)\}/)
    if (sectionMatch) {
      if (currentSection) sections.push(currentSection)
      currentSection = { title: sectionMatch[1].trim(), paragraphs: [], items: [] }
      continue
    }

    if (/^\\(documentclass|usepackage|begin|end|maketitle|title|author|date)/.test(line)) {
      continue
    }

    const itemMatch = line.match(/^\\item\s+(.*)$/)
    const plainText = normalizeLatexText(itemMatch ? itemMatch[1] : line)
    if (!plainText) continue

    if (itemMatch) {
      if (currentSection) currentSection.items.push(plainText)
      continue
    }

    if (currentSection) {
      currentSection.paragraphs.push(plainText)
    } else {
      introParagraphs.push(plainText)
    }
  }

  if (currentSection) sections.push(currentSection)

  return {
    title: extractCommandArgument(source, 'title') || 'What is Prism?',
    intro:
      introParagraphs.join(' ') ||
      'Prism is an AI-powered LaTeX editor for drafting technical documents with live collaboration.',
    sections,
  }
}

export function PrismView() {
  const [source, setSource] = useState(() => DEFAULT_SOURCE)
  const [projectName] = useState('New Project')

  const preview = useMemo(() => buildPreviewModel(source), [source])
  const lines = useMemo(() => source.split('\n'), [source])

  const handleRefresh = useCallback(() => {
    setSource(DEFAULT_SOURCE)
  }, [])

  const handleNewProject = useCallback(() => {
    setSource(DEFAULT_SOURCE)
  }, [])

  const handleOpenExternal = useCallback(() => {
    window.open(PRISM_BASE_URL, '_blank', 'noopener,noreferrer')
  }, [])

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-[color-mix(in_srgb,var(--bg)_88%,black)] text-[var(--text-primary)]">
      <aside className="hidden w-[220px] shrink-0 border-r border-[color-mix(in_srgb,var(--border)_80%,black)] bg-[color-mix(in_srgb,var(--bg-elevated)_76%,black)] xl:flex xl:flex-col">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] text-[var(--brand)]">
            <Icon icon="lucide:file-text" width={14} height={14} />
          </span>
          <button
            type="button"
            onClick={handleNewProject}
            className="flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]"
          >
            {projectName}
            <Icon
              icon="lucide:chevron-down"
              width={12}
              height={12}
              className="text-[var(--text-disabled)]"
            />
          </button>
        </div>

        <div className="px-4 pb-3">
          <div className="inline-flex rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,black)] p-1 text-[11px]">
            <button
              type="button"
              className="rounded-lg bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] px-3 py-1 text-[var(--text-primary)]"
            >
              Files
            </button>
            <button type="button" className="px-3 py-1 text-[var(--text-disabled)]">
              Chats
            </button>
          </div>
        </div>

        <div className="px-4">
          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--warning)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] p-4">
            <div className="flex items-start gap-2">
              <Icon
                icon="lucide:lock"
                width={14}
                height={14}
                className="mt-0.5 text-[var(--warning)]"
              />
              <div className="space-y-2">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Don&apos;t lose access
                </p>
                <p className="text-[11px] leading-5 text-[var(--text-secondary)]">
                  Sign in to sync your projects and save progress across devices.
                </p>
                <button
                  type="button"
                  className="w-full rounded-xl bg-[var(--bg)] px-3 py-2 text-[11px] font-medium text-[var(--text-primary)]"
                >
                  Sign In or Sign Up
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto px-3">
          <div className="space-y-1">
            {PRISM_FILES.map((fileName) => (
              <button
                key={fileName}
                type="button"
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] ${
                  fileName === DEFAULT_FILE_NAME
                    ? 'bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]'
                }`}
              >
                <Icon
                  icon={fileName.endsWith('.jpg') ? 'lucide:image' : 'lucide:file'}
                  width={13}
                  height={13}
                  className="text-[var(--text-disabled)]"
                />
                <span className="truncate">{fileName}</span>
              </button>
            ))}
          </div>

          <div className="mt-8 space-y-2 px-1">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-disabled)]">
              Outline
            </div>
            <div className="space-y-1">
              {preview.sections.map((section) => (
                <div
                  key={section.title}
                  className="flex items-center gap-2 rounded-lg px-2 py-1 text-[11px] text-[var(--text-tertiary)]"
                >
                  <Icon
                    icon="lucide:hash"
                    width={11}
                    height={11}
                    className="text-[var(--text-disabled)]"
                  />
                  <span className="truncate">{section.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={handleOpenExternal}
            className="flex w-full items-center justify-between rounded-xl bg-[color-mix(in_srgb,var(--bg)_92%,black)] px-3 py-2 text-[11px] text-[var(--text-secondary)]"
          >
            <span>Open real Prism</span>
            <Icon icon="lucide:external-link" width={12} height={12} />
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col xl:flex-row">
        <section className="flex min-h-0 min-w-0 flex-[1.15] flex-col border-b border-[var(--border)] xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_90%,black)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_80%,black)] px-3 py-1 text-[11px] text-[var(--text-primary)]">
                {DEFAULT_FILE_NAME}
              </span>
              <span className="text-[11px] text-[var(--text-disabled)]">LaTeX workspace</span>
            </div>
            <button
              type="button"
              className="rounded-xl bg-[color-mix(in_srgb,var(--brand)_18%,transparent)] px-3 py-1.5 text-[11px] font-medium text-[var(--brand)]"
            >
              Tools 18
            </button>
          </div>

          <div className="relative min-h-0 flex-1 bg-[color-mix(in_srgb,var(--bg)_95%,black)]">
            <div className="absolute inset-y-0 left-0 z-10 w-14 border-r border-[color-mix(in_srgb,var(--border)_70%,black)] bg-[color-mix(in_srgb,var(--bg)_96%,black)] px-3 py-4 text-right font-mono text-[11px] text-[var(--text-disabled)]">
              {lines.map((_, index) => (
                <div key={index} className="h-6 leading-6">
                  {index + 1}
                </div>
              ))}
            </div>
            <textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
              className="h-full w-full resize-none bg-transparent pl-[72px] pr-6 pt-4 font-mono text-[13px] leading-6 text-[color-mix(in_srgb,var(--text-primary)_94%,white)] outline-none"
            />
          </div>

          <div className="border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,black)] px-4 py-3">
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_75%,black)] px-4 py-3">
              <span className="rounded-full bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] p-2 text-[var(--brand)]">
                <Icon icon="lucide:sparkles" width={14} height={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-[var(--text-disabled)]">Welcome to ChatGPT</div>
                <div className="truncate text-sm text-[var(--text-secondary)]">
                  Ask for edits, diagrams, citations, or section rewrites directly from the
                  document.
                </div>
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              >
                Reset
              </button>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--bg)_78%,white)]">
          <div className="flex items-center justify-between border-b border-[color-mix(in_srgb,var(--border)_80%,white)] bg-[color-mix(in_srgb,var(--bg)_85%,white)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon
                icon="lucide:monitor"
                width={14}
                height={14}
                className="text-[var(--text-secondary)]"
              />
              <span className="text-sm font-medium text-[var(--text-primary)]">Console</span>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-[var(--text-disabled)]">
              <span>01</span>
              <span>of 01</span>
              <span>Zoom to fit</span>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto px-6 py-6">
            <div className="mx-auto w-full max-w-[640px] rounded-[28px] border border-[color-mix(in_srgb,var(--border)_55%,white)] bg-[color-mix(in_srgb,white_96%,var(--bg))] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.16)] sm:p-12">
              <article className="mx-auto max-w-[500px] text-[color-mix(in_srgb,black_88%,var(--text-primary))]">
                <h1 className="font-serif text-[28px] font-semibold leading-tight">
                  {preview.title}
                </h1>
                <p className="mt-5 text-[14px] leading-7 text-[color-mix(in_srgb,black_70%,var(--text-secondary))]">
                  {preview.intro}
                </p>

                {preview.sections.map((section) => (
                  <section key={section.title} className="mt-10">
                    <h2 className="font-serif text-[22px] font-semibold">{section.title}</h2>
                    {section.paragraphs.map((paragraph, index) => (
                      <p
                        key={`${section.title}-${index}`}
                        className="mt-4 text-[14px] leading-7 text-[color-mix(in_srgb,black_70%,var(--text-secondary))]"
                      >
                        {paragraph}
                      </p>
                    ))}

                    {section.items.length > 0 && (
                      <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        {section.items.map((item, index) => (
                          <div
                            key={`${section.title}-item-${index}`}
                            className="rounded-2xl border border-[color-mix(in_srgb,black_10%,transparent)] bg-[color-mix(in_srgb,white_88%,var(--bg))] p-4"
                          >
                            <div className="mb-3 flex h-24 items-center justify-center rounded-xl border border-dashed border-[color-mix(in_srgb,black_12%,transparent)] bg-[color-mix(in_srgb,black_3%,transparent)] text-[11px] uppercase tracking-[0.18em] text-[color-mix(in_srgb,black_45%,var(--text-disabled))]">
                              {index % 2 === 0 ? 'Equation' : 'Figure'}
                            </div>
                            <p className="text-[13px] leading-6 text-[color-mix(in_srgb,black_72%,var(--text-secondary))]">
                              {item}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ))}

                <div className="mt-12 text-center text-[12px] text-[color-mix(in_srgb,black_45%,var(--text-disabled))]">
                  1
                </div>
              </article>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
              <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--bg)_92%,black)] px-3 py-2 shadow-[var(--shadow-lg)]">
                <button type="button" className="rounded-full p-1 text-[var(--text-secondary)]">
                  <Icon icon="lucide:chevron-left" width={14} height={14} />
                </button>
                <button
                  type="button"
                  className="rounded-full bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] p-1 text-[var(--text-primary)]"
                >
                  <Icon icon="lucide:circle" width={10} height={10} />
                </button>
                <button type="button" className="rounded-full p-1 text-[var(--text-secondary)]">
                  <Icon icon="lucide:chevron-right" width={14} height={14} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
