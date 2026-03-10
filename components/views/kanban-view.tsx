'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Icon } from '@iconify/react'
import { motion, AnimatePresence } from 'framer-motion'

type Priority = 'P0' | 'P1' | 'P2' | 'P3'

interface Label {
  id: string
  name: string
  color: string
}

interface Subtask {
  id: string
  title: string
  done: boolean
}

interface Comment {
  id: string
  text: string
  createdAt: number
}

interface Activity {
  id: string
  action: string
  timestamp: number
}

interface KanbanCard {
  id: string
  title: string
  description?: string
  labels: string[]
  priority: Priority
  assignee?: string
  createdAt: number
  dueDate?: number
  columnId: string
  sortOrder: number
  subtasks: Subtask[]
  linkedBranch?: string
  comments: Comment[]
  activity: Activity[]
}

interface KanbanColumn {
  id: string
  title: string
  icon: string
  color: string
  collapsed: boolean
  wipLimit?: number
}

interface KanbanBoard {
  id: string
  name: string
  cards: KanbanCard[]
  columns: KanbanColumn[]
  labels: Label[]
}

interface KanbanData {
  boards: KanbanBoard[]
  activeBoard: string
}

interface KanbanRecommendation {
  id: string
  icon: string
  title: string
  description: string
  action: string
  actionFn: () => void
  priority: 'high' | 'medium' | 'low'
  category: 'workflow' | 'hygiene' | 'productivity' | 'suggestion'
}

interface BoardHealth {
  score: number
  color: string
  breakdown: {
    wip: number
    labels: number
    descriptions: number
    stale: number
    overdue: number
  }
}

const STORAGE_KEY = 'knot-code:kanban:boards'
const DISMISSED_RECS_KEY = 'knot-code:kanban:dismissed-recs'
const REC_PANEL_STATE_KEY = 'knot-code:kanban:rec-panel-collapsed'

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'backlog', title: 'Backlog', icon: 'lucide:inbox', color: '#6b7280', collapsed: false },
  {
    id: 'started',
    title: 'Started',
    icon: 'lucide:play',
    color: '#3b82f6',
    collapsed: false,
  },
  { id: 'review', title: 'Reviewing', icon: 'lucide:eye', color: '#f59e0b', collapsed: false },
  { id: 'done', title: 'Done', icon: 'lucide:check', color: '#22c55e', collapsed: false },
]

const DEFAULT_LABELS: Label[] = [
  { id: 'bug', name: 'Bug', color: '#ef4444' },
  { id: 'feature', name: 'Feature', color: '#3b82f6' },
  { id: 'docs', name: 'Docs', color: '#22c55e' },
  { id: 'refactor', name: 'Refactor', color: '#a855f7' },
  { id: 'urgent', name: 'Urgent', color: '#f97316' },
]

// ── Card Templates ─────────────────────────────────────────────
interface CardTemplate {
  id: string
  name: string
  icon: string
  title: string
  priority: Priority
  labels: string[]
  subtasks: string[]
  description?: string
}

const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: 'bug-report',
    name: 'Bug Report',
    icon: 'lucide:bug',
    title: 'Bug: [describe issue]',
    priority: 'P1',
    labels: ['bug'],
    subtasks: ['Steps to reproduce', 'Expected behavior', 'Actual behavior', 'Environment info'],
  },
  {
    id: 'feature-request',
    name: 'Feature Request',
    icon: 'lucide:sparkles',
    title: 'Feature: [describe feature]',
    priority: 'P2',
    labels: ['feature'],
    subtasks: ['User story', 'Acceptance criteria', 'Design mockup', 'Implementation plan'],
  },
  {
    id: 'test-case',
    name: 'Test Case',
    icon: 'lucide:flask-conical',
    title: 'Test: [describe test]',
    priority: 'P2',
    labels: ['docs'],
    subtasks: ['Setup', 'Steps', 'Assertions', 'Cleanup'],
  },
  {
    id: 'security-issue',
    name: 'Security Issue',
    icon: 'lucide:shield-alert',
    title: 'Security: [describe vulnerability]',
    priority: 'P0',
    labels: ['urgent'],
    subtasks: ['Identify scope', 'Assess impact', 'Implement fix', 'Verify fix', 'Post-mortem'],
  },
  {
    id: 'refactor',
    name: 'Refactor',
    icon: 'lucide:wrench',
    title: 'Refactor: [describe target]',
    priority: 'P2',
    labels: ['refactor'],
    subtasks: ['Identify code smells', 'Plan changes', 'Implement', 'Run tests', 'Review'],
  },
  {
    id: 'documentation',
    name: 'Documentation',
    icon: 'lucide:file-text',
    title: 'Docs: [describe docs]',
    priority: 'P3',
    labels: ['docs'],
    subtasks: ['Outline', 'Draft', 'Review', 'Publish'],
  },
  {
    id: 'code-review',
    name: 'Code Review',
    icon: 'lucide:git-pull-request',
    title: 'Review: [PR/branch name]',
    priority: 'P1',
    labels: ['feature'],
    subtasks: [],
    description: 'PR: \nBranch: \nChanges: ',
  },
  {
    id: 'hotfix',
    name: 'Hotfix',
    icon: 'lucide:flame',
    title: 'Hotfix: [describe fix]',
    priority: 'P0',
    labels: ['bug', 'urgent'],
    subtasks: ['Identify issue', 'Write fix', 'Test fix', 'Deploy to prod', 'Verify in prod'],
  },
]

// ── Board Templates ────────────────────────────────────────────
interface BoardTemplateCard {
  title: string
  description?: string
  labels: string[]
  priority: Priority
  subtasks: string[]
  columnId: string
}

interface BoardTemplate {
  id: string
  name: string
  icon: string
  description: string
  columns: Omit<KanbanColumn, 'collapsed'>[]
  cards: BoardTemplateCard[]
}

const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'empty',
    name: 'Empty Board',
    icon: 'lucide:layout-grid',
    description: 'Start with a blank canvas',
    columns: [
      { id: 'backlog', title: 'Backlog', icon: 'lucide:inbox', color: '#6b7280' },
      { id: 'started', title: 'Started', icon: 'lucide:play', color: '#3b82f6' },
      { id: 'review', title: 'Reviewing', icon: 'lucide:eye', color: '#f59e0b' },
      { id: 'done', title: 'Done', icon: 'lucide:check', color: '#22c55e' },
    ],
    cards: [],
  },
  {
    id: 'sprint-planning',
    name: 'Sprint Planning',
    icon: 'lucide:rocket',
    description: 'Organize your sprint workflow',
    columns: [
      { id: 'backlog', title: 'Backlog', icon: 'lucide:inbox', color: '#6b7280' },
      { id: 'sprint', title: 'Sprint', icon: 'lucide:target', color: '#8b5cf6' },
      { id: 'in-progress', title: 'In Progress', icon: 'lucide:play', color: '#3b82f6' },
      { id: 'review', title: 'Review', icon: 'lucide:eye', color: '#f59e0b' },
      { id: 'done', title: 'Done', icon: 'lucide:check', color: '#22c55e' },
    ],
    cards: [
      {
        title: 'Define sprint goals',
        priority: 'P1',
        labels: ['feature'],
        description: 'Identify key deliverables',
        subtasks: [],
        columnId: 'sprint',
      },
      {
        title: 'Estimate story points',
        priority: 'P2',
        labels: ['feature'],
        subtasks: [],
        columnId: 'sprint',
      },
      {
        title: 'Prioritize backlog items',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'backlog',
      },
      {
        title: 'Assign team capacity',
        priority: 'P2',
        labels: ['feature'],
        subtasks: [],
        columnId: 'backlog',
      },
      {
        title: 'Set sprint duration',
        priority: 'P3',
        labels: ['feature'],
        subtasks: [],
        columnId: 'backlog',
      },
    ],
  },
  {
    id: 'bug-triage',
    name: 'Bug Triage',
    icon: 'lucide:bug',
    description: 'Track and fix bugs systematically',
    columns: [
      { id: 'reported', title: 'Reported', icon: 'lucide:inbox', color: '#6b7280' },
      { id: 'confirmed', title: 'Confirmed', icon: 'lucide:check-circle', color: '#f97316' },
      { id: 'in-fix', title: 'In Fix', icon: 'lucide:wrench', color: '#3b82f6' },
      { id: 'qa', title: 'QA', icon: 'lucide:flask-conical', color: '#8b5cf6' },
      { id: 'resolved', title: 'Resolved', icon: 'lucide:check', color: '#22c55e' },
    ],
    cards: [
      {
        title: 'Critical crash on startup',
        priority: 'P0',
        labels: ['bug'],
        subtasks: ['Reproduce', 'Identify root cause', 'Write fix', 'Add regression test'],
        columnId: 'reported',
      },
      {
        title: 'Memory leak in data processing',
        priority: 'P1',
        labels: ['bug'],
        subtasks: [],
        columnId: 'reported',
      },
      {
        title: 'UI alignment issue on mobile',
        priority: 'P2',
        labels: ['bug'],
        subtasks: [],
        columnId: 'confirmed',
      },
      {
        title: 'Broken link in footer',
        priority: 'P3',
        labels: ['bug'],
        subtasks: [],
        columnId: 'confirmed',
      },
      {
        title: 'Performance degradation after update',
        priority: 'P1',
        labels: ['bug'],
        subtasks: [],
        columnId: 'reported',
      },
    ],
  },
  {
    id: 'security-audit',
    name: 'Security Audit',
    icon: 'lucide:shield-check',
    description: 'Security review checklist',
    columns: [
      { id: 'scan', title: 'Scan', icon: 'lucide:search', color: '#6b7280' },
      { id: 'analyze', title: 'Analyze', icon: 'lucide:microscope', color: '#f97316' },
      { id: 'remediate', title: 'Remediate', icon: 'lucide:wrench', color: '#3b82f6' },
      { id: 'verify', title: 'Verify', icon: 'lucide:check-circle', color: '#8b5cf6' },
      { id: 'closed', title: 'Closed', icon: 'lucide:lock', color: '#22c55e' },
    ],
    cards: [
      {
        title: 'Run dependency audit (npm audit)',
        priority: 'P0',
        labels: ['urgent'],
        subtasks: ['Run scan', 'Review critical', 'Review high', 'Review moderate'],
        columnId: 'scan',
      },
      {
        title: 'Check for hardcoded secrets',
        priority: 'P0',
        labels: ['urgent'],
        subtasks: [],
        columnId: 'scan',
      },
      {
        title: 'Review authentication flow',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'scan',
      },
      {
        title: 'Test CORS configuration',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'analyze',
      },
      {
        title: 'Verify CSP headers',
        priority: 'P2',
        labels: ['feature'],
        subtasks: [],
        columnId: 'analyze',
      },
      {
        title: 'Check SQL injection vectors',
        priority: 'P1',
        labels: ['bug'],
        subtasks: [],
        columnId: 'scan',
      },
      {
        title: 'Review rate limiting',
        priority: 'P2',
        labels: ['feature'],
        subtasks: [],
        columnId: 'analyze',
      },
    ],
  },
  {
    id: 'test-coverage',
    name: 'Test Coverage',
    icon: 'lucide:flask-conical',
    description: 'Improve test coverage',
    columns: [
      { id: 'untested', title: 'Untested', icon: 'lucide:alert-circle', color: '#ef4444' },
      { id: 'writing-tests', title: 'Writing Tests', icon: 'lucide:edit', color: '#3b82f6' },
      { id: 'in-review', title: 'In Review', icon: 'lucide:eye', color: '#f59e0b' },
      { id: 'passing', title: 'Passing', icon: 'lucide:check-circle', color: '#22c55e' },
      { id: 'skipped', title: 'Skipped', icon: 'lucide:skip-forward', color: '#6b7280' },
    ],
    cards: [
      {
        title: 'Unit tests for auth module',
        priority: 'P1',
        labels: ['feature'],
        subtasks: ['Login flow', 'Register flow', 'Password reset', 'Token refresh'],
        columnId: 'untested',
      },
      {
        title: 'Integration tests for API',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'untested',
      },
      {
        title: 'E2E tests for checkout',
        priority: 'P2',
        labels: ['feature'],
        subtasks: [],
        columnId: 'writing-tests',
      },
      {
        title: 'Snapshot tests for components',
        priority: 'P3',
        labels: ['feature'],
        subtasks: [],
        columnId: 'untested',
      },
      {
        title: 'Performance benchmarks',
        priority: 'P2',
        labels: ['feature'],
        subtasks: [],
        columnId: 'untested',
      },
    ],
  },
  {
    id: 'release-checklist',
    name: 'Release Checklist',
    icon: 'lucide:package',
    description: 'Pre-release preparation',
    columns: [
      { id: 'pre-release', title: 'Pre-Release', icon: 'lucide:clipboard-list', color: '#6b7280' },
      { id: 'building', title: 'Building', icon: 'lucide:hammer', color: '#3b82f6' },
      { id: 'testing', title: 'Testing', icon: 'lucide:flask-conical', color: '#f59e0b' },
      { id: 'staging', title: 'Staging', icon: 'lucide:cloud-upload', color: '#8b5cf6' },
      { id: 'shipped', title: 'Shipped', icon: 'lucide:rocket', color: '#22c55e' },
    ],
    cards: [
      {
        title: 'Update CHANGELOG.md',
        priority: 'P1',
        labels: ['docs'],
        subtasks: [],
        columnId: 'pre-release',
      },
      {
        title: 'Bump version numbers',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'pre-release',
      },
      {
        title: 'Run full test suite',
        priority: 'P0',
        labels: ['urgent'],
        subtasks: ['Unit tests', 'Integration tests', 'E2E tests', 'Smoke tests'],
        columnId: 'testing',
      },
      {
        title: 'Build release assets',
        priority: 'P1',
        labels: ['feature'],
        subtasks: ['macOS DMG', 'Windows MSI', 'Linux AppImage', 'Linux DEB'],
        columnId: 'building',
      },
      {
        title: 'Update documentation',
        priority: 'P2',
        labels: ['docs'],
        subtasks: [],
        columnId: 'pre-release',
      },
      {
        title: 'Draft release notes',
        priority: 'P1',
        labels: ['docs'],
        subtasks: [],
        columnId: 'pre-release',
      },
      {
        title: 'Deploy to staging',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'testing',
      },
      {
        title: 'Final QA sign-off',
        priority: 'P0',
        labels: ['urgent'],
        subtasks: [],
        columnId: 'testing',
      },
    ],
  },
  {
    id: 'feature-development',
    name: 'Feature Development',
    icon: 'lucide:puzzle',
    description: 'End-to-end feature workflow',
    columns: [
      { id: 'discovery', title: 'Discovery', icon: 'lucide:lightbulb', color: '#6b7280' },
      { id: 'design', title: 'Design', icon: 'lucide:palette', color: '#f97316' },
      { id: 'implement', title: 'Implement', icon: 'lucide:code', color: '#3b82f6' },
      { id: 'review', title: 'Review', icon: 'lucide:eye', color: '#8b5cf6' },
      { id: 'ship', title: 'Ship', icon: 'lucide:rocket', color: '#22c55e' },
    ],
    cards: [
      {
        title: 'Write user stories',
        priority: 'P2',
        labels: ['docs'],
        subtasks: [],
        columnId: 'discovery',
      },
      {
        title: 'Create wireframes',
        priority: 'P2',
        labels: ['docs'],
        subtasks: [],
        columnId: 'design',
      },
      {
        title: 'Define acceptance criteria',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'discovery',
      },
      {
        title: 'Set up feature branch',
        priority: 'P3',
        labels: ['feature'],
        subtasks: [],
        columnId: 'implement',
      },
      {
        title: 'Implement core logic',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'implement',
      },
      {
        title: 'Write tests',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'implement',
      },
      {
        title: 'Code review',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'review',
      },
      {
        title: 'Update docs',
        priority: 'P2',
        labels: ['docs'],
        subtasks: [],
        columnId: 'review',
      },
    ],
  },
  {
    id: 'devops-pipeline',
    name: 'DevOps Pipeline',
    icon: 'lucide:cloud-cog',
    description: 'Infrastructure and CI/CD',
    columns: [
      { id: 'backlog', title: 'Backlog', icon: 'lucide:inbox', color: '#6b7280' },
      { id: 'configuring', title: 'Configuring', icon: 'lucide:settings', color: '#3b82f6' },
      { id: 'testing', title: 'Testing', icon: 'lucide:flask-conical', color: '#f59e0b' },
      { id: 'deployed', title: 'Deployed', icon: 'lucide:cloud-upload', color: '#22c55e' },
      { id: 'monitoring', title: 'Monitoring', icon: 'lucide:activity', color: '#8b5cf6' },
    ],
    cards: [
      {
        title: 'Set up CI/CD pipeline',
        priority: 'P0',
        labels: ['urgent'],
        subtasks: ['GitHub Actions', 'Build step', 'Test step', 'Deploy step'],
        columnId: 'backlog',
      },
      {
        title: 'Configure monitoring alerts',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'backlog',
      },
      {
        title: 'Set up staging environment',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'configuring',
      },
      {
        title: 'Implement rollback strategy',
        priority: 'P1',
        labels: ['feature'],
        subtasks: [],
        columnId: 'backlog',
      },
      {
        title: 'Document deployment process',
        priority: 'P2',
        labels: ['docs'],
        subtasks: [],
        columnId: 'backlog',
      },
    ],
  },
  {
    id: 'research-spike',
    name: 'Research & Spike',
    icon: 'lucide:microscope',
    description: 'Exploration and prototyping',
    columns: [
      { id: 'ideas', title: 'Ideas', icon: 'lucide:lightbulb', color: '#6b7280' },
      { id: 'investigating', title: 'Investigating', icon: 'lucide:search', color: '#3b82f6' },
      { id: 'prototyping', title: 'Prototyping', icon: 'lucide:flask-conical', color: '#f59e0b' },
      { id: 'findings', title: 'Findings', icon: 'lucide:clipboard-check', color: '#22c55e' },
      { id: 'archived', title: 'Archived', icon: 'lucide:archive', color: '#6b7280' },
    ],
    cards: [
      {
        title: 'Evaluate alternative frameworks',
        priority: 'P2',
        labels: ['feature'],
        subtasks: [],
        columnId: 'ideas',
      },
      {
        title: 'Benchmark database options',
        priority: 'P2',
        labels: ['feature'],
        subtasks: [],
        columnId: 'investigating',
      },
      {
        title: 'Prototype new UI approach',
        priority: 'P2',
        labels: ['feature'],
        subtasks: [],
        columnId: 'prototyping',
      },
      {
        title: 'Research API design patterns',
        priority: 'P3',
        labels: ['docs'],
        subtasks: [],
        columnId: 'ideas',
      },
      {
        title: 'Analyze competitor features',
        priority: 'P3',
        labels: ['docs'],
        subtasks: [],
        columnId: 'investigating',
      },
    ],
  },
]

const PRIORITY_CONFIG = {
  P0: { label: 'Critical', color: '#ef4444', icon: 'lucide:alert-triangle' },
  P1: { label: 'High', color: '#f97316', icon: 'lucide:arrow-up' },
  P2: { label: 'Medium', color: '#eab308', icon: 'lucide:minus' },
  P3: { label: 'Low', color: '#6b7280', icon: 'lucide:arrow-down' },
}

const COLUMN_ICON_FALLBACKS: Record<string, string> = {
  backlog: 'lucide:inbox',
  started: 'lucide:play',
  'in-progress': 'lucide:play',
  review: 'lucide:eye',
  done: 'lucide:check',
}

function sanitizeColumnIcon(icon: string | undefined, columnId: string): string {
  if (icon && icon.includes(':')) return icon
  return COLUMN_ICON_FALLBACKS[columnId] ?? 'lucide:layout-list'
}

function loadKanbanData(): KanbanData {
  if (typeof window === 'undefined') {
    return {
      boards: [
        {
          id: 'default',
          name: 'Project Tasks',
          cards: [],
          columns: DEFAULT_COLUMNS,
          labels: DEFAULT_LABELS,
        },
      ],
      activeBoard: 'default',
    }
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as KanbanData
      parsed.boards = parsed.boards.map((b) => ({
        ...b,
        columns: b.columns.map((col) => ({
          ...col,
          icon: sanitizeColumnIcon(col.icon, col.id),
        })),
        cards: b.cards.map((c) => ({
          ...c,
          sortOrder: c.sortOrder ?? 0,
          subtasks: c.subtasks ?? [],
          comments: c.comments ?? [],
          activity: c.activity ?? [],
        })),
      }))
      return parsed
    }
  } catch {
    /* noop */
  }
  return {
    boards: [
      {
        id: 'default',
        name: 'Project Tasks',
        cards: [],
        columns: DEFAULT_COLUMNS,
        labels: DEFAULT_LABELS,
      },
    ],
    activeBoard: 'default',
  }
}

function saveKanbanData(data: KanbanData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* noop */
  }
}

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function getDueDateStatus(dueDate?: number): 'overdue' | 'soon' | 'ok' | null {
  if (!dueDate) return null
  const now = Date.now()
  const diff = dueDate - now
  if (diff < 0) return 'overdue'
  if (diff < 86400000 * 2) return 'soon'
  return 'ok'
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateInput(ts?: number) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Board Health Calculation ───────────────────────────────────
function calculateBoardHealth(cards: KanbanCard[], columns: KanbanColumn[]): BoardHealth {
  if (cards.length === 0) {
    return {
      score: 100,
      color: '#22c55e',
      breakdown: { wip: 100, labels: 100, descriptions: 100, stale: 100, overdue: 100 },
    }
  }

  // WIP ratio (started column should have <= 3 cards)
  const startedCol = columns.find((c) => c.id === 'started')
  const wipCards = cards.filter((c) => c.columnId === 'started').length
  const wipScore = startedCol ? Math.max(0, 100 - (wipCards > 3 ? (wipCards - 3) * 20 : 0)) : 100

  // Label coverage
  const cardsWithLabels = cards.filter((c) => c.labels.length > 0).length
  const labelScore = (cardsWithLabels / cards.length) * 100

  // Description coverage
  const cardsWithDesc = cards.filter((c) => c.description && c.description.trim()).length
  const descScore = (cardsWithDesc / cards.length) * 100

  // Stale cards (in same column > 7 days)
  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  const staleCards = cards.filter((c) => {
    const lastActivity = c.activity?.[c.activity.length - 1]?.timestamp || c.createdAt
    return now - lastActivity > sevenDays && c.columnId !== 'done'
  }).length
  const staleScore = Math.max(0, 100 - staleCards * 15)

  // Overdue cards
  const overdueCards = cards.filter((c) => c.dueDate && c.dueDate < now).length
  const overdueScore = Math.max(0, 100 - overdueCards * 20)

  const totalScore = (wipScore + labelScore + descScore + staleScore + overdueScore) / 5

  let color = '#22c55e' // green
  if (totalScore < 50)
    color = '#ef4444' // red
  else if (totalScore < 75) color = '#f59e0b' // amber

  return {
    score: Math.round(totalScore),
    color,
    breakdown: {
      wip: Math.round(wipScore),
      labels: Math.round(labelScore),
      descriptions: Math.round(descScore),
      stale: Math.round(staleScore),
      overdue: Math.round(overdueScore),
    },
  }
}

// ── Recommendations Generator ───────────────────────────────────
function generateRecommendations(
  cards: KanbanCard[],
  columns: KanbanColumn[],
  dismissedIds: string[],
  handlers: {
    onHighlightColumn: (colId: string) => void
    onOpenCard: (cardId: string) => void
    onNewCard: () => void
    onClearDone: () => void
    onShowToast: (msg: string) => void
  },
): KanbanRecommendation[] {
  const recs: KanbanRecommendation[] = []
  const now = Date.now()

  // Helper: find column by ID
  const findCol = (id: string) => columns.find((c) => c.id === id)

  // Workflow recommendations
  const startedCards = cards.filter((c) => c.columnId === 'started')
  if (startedCards.length > 3) {
    recs.push({
      id: 'wip-too-high',
      icon: 'lucide:alert-triangle',
      title: 'Too much WIP',
      description:
        'Consider finishing current work before starting new tasks. Move some cards back to Backlog.',
      action: 'View Started',
      actionFn: () => handlers.onHighlightColumn('started'),
      priority: 'high',
      category: 'workflow',
    })
  }

  const reviewCards = cards.filter((c) => c.columnId === 'review')
  if (reviewCards.length > 5) {
    recs.push({
      id: 'review-bottleneck',
      icon: 'lucide:traffic-cone',
      title: 'Review bottleneck',
      description: 'Reviews are piling up. Prioritize reviewing before adding new work.',
      action: 'View Review',
      actionFn: () => handlers.onHighlightColumn('review'),
      priority: 'high',
      category: 'workflow',
    })
  }

  const doneCards = cards.filter((c) => c.columnId === 'done')
  if (doneCards.length > 10) {
    recs.push({
      id: 'archive-done',
      icon: 'lucide:archive',
      title: 'Archive completed',
      description: 'You have many completed cards. Consider archiving the Done column.',
      action: 'Clear Done',
      actionFn: () => handlers.onClearDone(),
      priority: 'medium',
      category: 'workflow',
    })
  }

  // Hygiene recommendations
  const cardsNoLabels = cards.filter((c) => c.labels.length === 0)
  if (cardsNoLabels.length > 0) {
    recs.push({
      id: 'add-labels',
      icon: 'lucide:tag',
      title: 'Add labels',
      description: `${cardsNoLabels.length} card${cardsNoLabels.length > 1 ? 's' : ''} ${cardsNoLabels.length > 1 ? 'have' : 'has'} no labels. Labels help categorize and filter work.`,
      action: 'Add Labels',
      actionFn: () => handlers.onOpenCard(cardsNoLabels[0].id),
      priority: 'medium',
      category: 'hygiene',
    })
  }

  const cardsNoDesc = cards.filter((c) => !c.description || !c.description.trim())
  if (cardsNoDesc.length > 0) {
    recs.push({
      id: 'add-descriptions',
      icon: 'lucide:file-text',
      title: 'Add descriptions',
      description: `${cardsNoDesc.length} card${cardsNoDesc.length > 1 ? 's' : ''} lack descriptions. Good descriptions prevent context loss.`,
      action: 'Add Description',
      actionFn: () => handlers.onOpenCard(cardsNoDesc[0].id),
      priority: 'low',
      category: 'hygiene',
    })
  }

  const sevenDays = 7 * 24 * 60 * 60 * 1000
  const staleCards = cards.filter((c) => {
    const lastActivity = c.activity?.[c.activity.length - 1]?.timestamp || c.createdAt
    return now - lastActivity > sevenDays && c.columnId !== 'done'
  })
  if (staleCards.length > 0) {
    recs.push({
      id: 'stale-cards',
      icon: 'lucide:clock',
      title: 'Stale cards detected',
      description: `${staleCards.length} card${staleCards.length > 1 ? 's' : ''} haven't moved in over a week. Review if they're blocked.`,
      action: 'View Card',
      actionFn: () => handlers.onOpenCard(staleCards[0].id),
      priority: 'medium',
      category: 'hygiene',
    })
  }

  const highPriorityInBacklog = cards.filter(
    (c) => (c.priority === 'P0' || c.priority === 'P1') && c.columnId === 'backlog',
  )
  if (highPriorityInBacklog.length > 0) {
    recs.push({
      id: 'high-priority-backlog',
      icon: 'lucide:flame',
      title: 'High priority in backlog',
      description: `${highPriorityInBacklog.length} high-priority card${highPriorityInBacklog.length > 1 ? 's' : ''} ${highPriorityInBacklog.length > 1 ? 'are' : 'is'} still in Backlog. Consider moving to In Progress.`,
      action: 'View Card',
      actionFn: () => handlers.onOpenCard(highPriorityInBacklog[0].id),
      priority: 'high',
      category: 'hygiene',
    })
  }

  // Productivity recommendations
  if (cards.length === 0) {
    recs.push({
      id: 'get-started',
      icon: 'lucide:rocket',
      title: 'Get started',
      description: 'Add your first card to start tracking work.',
      action: 'New Card',
      actionFn: () => handlers.onNewCard(),
      priority: 'high',
      category: 'productivity',
    })
  }

  if (cards.length > 0 && cards.every((c) => c.columnId === 'done')) {
    recs.push({
      id: 'board-clear',
      icon: 'lucide:party-popper',
      title: 'Board clear!',
      description: 'All work is done. Time to plan your next sprint.',
      action: 'New Card',
      actionFn: () => handlers.onNewCard(),
      priority: 'low',
      category: 'productivity',
    })
  }

  const cardsNoDueDate = cards.filter((c) => !c.dueDate && c.columnId !== 'done')
  if (cardsNoDueDate.length === cards.length && cards.length > 0) {
    recs.push({
      id: 'set-deadlines',
      icon: 'lucide:calendar-clock',
      title: 'Set deadlines',
      description: 'None of your cards have due dates. Deadlines help prioritize.',
      action: 'Learn More',
      actionFn: () => handlers.onShowToast('Add due dates to cards for better time management.'),
      priority: 'low',
      category: 'productivity',
    })
  }

  const allSubtasks = cards.flatMap((c) => c.subtasks)
  const doneSubtasks = allSubtasks.filter((s) => s.done)
  if (allSubtasks.length > 0 && doneSubtasks.length / allSubtasks.length < 0.5) {
    recs.push({
      id: 'subtask-progress-low',
      icon: 'lucide:list-checks',
      title: 'Subtask progress low',
      description: 'Many subtasks remain incomplete. Focus on finishing started work.',
      action: 'View Cards',
      actionFn: () => handlers.onShowToast('Review cards with incomplete subtasks.'),
      priority: 'medium',
      category: 'productivity',
    })
  }

  // Suggestions (always show one)
  const suggestions: KanbanRecommendation[] = [
    {
      id: 'tip-keyboard',
      icon: 'lucide:keyboard',
      title: 'Try keyboard shortcuts',
      description: 'Press N to create a new card, / to search, D to toggle details.',
      action: 'Got it',
      actionFn: () => handlers.onShowToast('Keyboard shortcuts can boost your productivity!'),
      priority: 'low',
      category: 'suggestion',
    },
    {
      id: 'tip-labels',
      icon: 'lucide:palette',
      title: 'Use labels for filtering',
      description: 'Color-coded labels help you quickly find related work.',
      action: 'Got it',
      actionFn: () => handlers.onShowToast('Labels make it easy to organize and filter cards.'),
      priority: 'low',
      category: 'suggestion',
    },
    {
      id: 'tip-time',
      icon: 'lucide:timer',
      title: 'Track time with due dates',
      description: 'Add due dates to cards for better time management.',
      action: 'Got it',
      actionFn: () => handlers.onShowToast('Due dates help you stay on track.'),
      priority: 'low',
      category: 'suggestion',
    },
  ]

  // Add one random suggestion if not already dismissed
  const availableSuggestions = suggestions.filter((s) => !dismissedIds.includes(s.id))
  if (availableSuggestions.length > 0) {
    const randomSuggestion =
      availableSuggestions[Math.floor(Math.random() * availableSuggestions.length)]
    recs.push(randomSuggestion)
  }

  // Filter out dismissed recommendations
  return recs
    .filter((r) => !dismissedIds.includes(r.id))
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
}

// ── Card Detail Panel ───────────────────────────────────────────
function CardDetailPanel({
  card,
  columns,
  labels,
  onUpdate,
  onDelete,
  onClose,
}: {
  card: KanbanCard
  columns: KanbanColumn[]
  labels: Label[]
  onUpdate: (id: string, updates: Partial<KanbanCard>) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description || '')
  const [priority, setPriority] = useState(card.priority)
  const [assignee, setAssignee] = useState(card.assignee || '')
  const [dueDate, setDueDate] = useState(formatDateInput(card.dueDate))
  const [selectedLabels, setSelectedLabels] = useState<string[]>(card.labels)
  const [subtasks, setSubtasks] = useState<Subtask[]>(card.subtasks)
  const [newSubtask, setNewSubtask] = useState('')
  const [columnId, setColumnId] = useState(card.columnId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [comments, setComments] = useState<Comment[]>(card.comments)
  const [newComment, setNewComment] = useState('')
  const [newLabelName, setNewLabelName] = useState('')
  const [showNewLabel, setShowNewLabel] = useState(false)
  const [draggedSubtaskId, setDraggedSubtaskId] = useState<string | null>(null)

  const save = useCallback(() => {
    onUpdate(card.id, {
      title: title.trim() || card.title,
      description: description.trim() || undefined,
      priority,
      assignee: assignee.trim() || undefined,
      dueDate: dueDate ? new Date(dueDate + 'T00:00:00').getTime() : undefined,
      labels: selectedLabels,
      subtasks,
      columnId,
      comments,
    })
  }, [
    card.id,
    card.title,
    title,
    description,
    priority,
    assignee,
    dueDate,
    selectedLabels,
    subtasks,
    columnId,
    comments,
    onUpdate,
  ])

  useEffect(() => {
    save()
  }, [save])

  const toggleLabel = (labelId: string) => {
    setSelectedLabels((prev) =>
      prev.includes(labelId) ? prev.filter((l) => l !== labelId) : [...prev, labelId],
    )
  }

  const addSubtask = () => {
    if (!newSubtask.trim()) return
    setSubtasks((prev) => [...prev, { id: genId('sub'), title: newSubtask.trim(), done: false }])
    setNewSubtask('')
  }

  const toggleSubtask = (subId: string) => {
    setSubtasks((prev) => prev.map((s) => (s.id === subId ? { ...s, done: !s.done } : s)))
  }

  const deleteSubtask = (subId: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== subId))
  }

  const reorderSubtasks = (fromIndex: number, toIndex: number) => {
    setSubtasks((prev) => {
      const result = [...prev]
      const [removed] = result.splice(fromIndex, 1)
      result.splice(toIndex, 0, removed)
      return result
    })
  }

  const addComment = () => {
    if (!newComment.trim()) return
    const comment: Comment = {
      id: genId('comment'),
      text: newComment.trim(),
      createdAt: Date.now(),
    }
    setComments((prev) => [...prev, comment])
    setNewComment('')
  }

  const addCustomLabel = (labels: Label[]) => {
    if (!newLabelName.trim()) return
    const newLabel: Label = {
      id: genId('label'),
      name: newLabelName.trim(),
      color: `#${Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0')}`,
    }
    labels.push(newLabel)
    setSelectedLabels((prev) => [...prev, newLabel.id])
    setNewLabelName('')
    setShowNewLabel(false)
  }

  const dueDateStatus = getDueDateStatus(card.dueDate)
  const subtasksDone = subtasks.filter((s) => s.done).length
  const subtasksTotal = subtasks.length

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="absolute inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
    >
      {/* Panel Header with Priority Border */}
      <div
        className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-6 py-4"
        style={{
          borderLeftWidth: '4px',
          borderLeftColor: PRIORITY_CONFIG[priority].color,
          borderLeftStyle: 'solid',
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 bg-transparent text-lg font-semibold text-[var(--text-primary)] outline-none"
          placeholder="Card title..."
        />
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-[var(--text-secondary)] transition hover:bg-[var(--bg)] hover:text-[var(--text-primary)]"
        >
          <Icon icon="lucide:x" width={20} height={20} />
        </button>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {/* Description Section */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Icon icon="lucide:text" width={16} height={16} className="text-[var(--brand)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Description</h3>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Add a description..."
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
          />
        </div>

        {/* Priority + Column Section */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Icon icon="lucide:signal" width={16} height={16} className="text-[var(--brand)]" />
            <Icon icon="lucide:columns" width={16} height={16} className="text-[var(--brand)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Priority & Status</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-disabled)] mb-1 block">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
              >
                {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {p} — {PRIORITY_CONFIG[p].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-disabled)] mb-1 block">
                Column
              </label>
              <select
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Assignee + Due Date Section */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Icon icon="lucide:user" width={16} height={16} className="text-[var(--brand)]" />
            <Icon icon="lucide:calendar" width={16} height={16} className="text-[var(--brand)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Assignee & Due Date
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-disabled)] mb-1 block">
                Assignee
              </label>
              <input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Name..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-disabled)] mb-1 block">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] ${
                  dueDateStatus === 'overdue'
                    ? 'border-[#ef4444] bg-[#ef444410] text-[#ef4444]'
                    : dueDateStatus === 'soon'
                      ? 'border-[#f59e0b] bg-[#f59e0b10] text-[#f59e0b]'
                      : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Labels Section */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Icon icon="lucide:tag" width={16} height={16} className="text-[var(--brand)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Labels</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => {
              const active = selectedLabels.includes(label.id)
              return (
                <motion.button
                  key={label.id}
                  onClick={() => toggleLabel(label.id)}
                  whileTap={{ scale: 0.95 }}
                  className="rounded-full px-3 py-1 text-xs font-medium transition-all duration-200"
                  style={{
                    backgroundColor: active ? label.color : 'transparent',
                    color: active ? '#fff' : label.color,
                    border: `1.5px solid ${label.color}`,
                    opacity: active ? 1 : 0.7,
                  }}
                >
                  {label.name}
                </motion.button>
              )
            })}
            {showNewLabel ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addCustomLabel(labels)
                    if (e.key === 'Escape') setShowNewLabel(false)
                  }}
                  placeholder="Label name..."
                  className="w-28 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--text-primary)] outline-none"
                />
                <button
                  onClick={() => addCustomLabel(labels)}
                  className="rounded-full border border-[var(--brand)] bg-[var(--brand)] px-2 text-xs text-white"
                >
                  <Icon icon="lucide:check" width={12} height={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewLabel(true)}
                className="rounded-full border border-dashed border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--text-disabled)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                + Add
              </button>
            )}
          </div>
        </div>

        {/* Linked branch */}
        {card.linkedBranch && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <Icon
                icon="lucide:git-branch"
                width={16}
                height={16}
                className="text-[var(--brand)]"
              />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Linked Branch</h3>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
              <Icon
                icon="lucide:git-branch"
                width={14}
                height={14}
                className="text-[var(--brand)]"
              />
              <span className="font-mono text-xs text-[var(--text-primary)]">
                {card.linkedBranch}
              </span>
            </div>
          </div>
        )}

        {/* Subtasks Section */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon
                icon="lucide:list-checks"
                width={16}
                height={16}
                className="text-[var(--brand)]"
              />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Subtasks {subtasksTotal > 0 && `(${subtasksDone}/${subtasksTotal})`}
              </h3>
            </div>
            {subtasksTotal > 0 && (
              <span className="text-xs text-[var(--text-disabled)]">
                {Math.round((subtasksDone / subtasksTotal) * 100)}%
              </span>
            )}
          </div>
          {subtasksTotal > 0 && (
            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(subtasksDone / subtasksTotal) * 100}%` }}
                transition={{ duration: 0.3 }}
                className="h-full rounded-full bg-[var(--brand)]"
              />
            </div>
          )}
          <div className="space-y-1">
            {subtasks.map((sub, index) => (
              <motion.div
                key={sub.id}
                layout
                draggable
                onDragStart={() => setDraggedSubtaskId(sub.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (draggedSubtaskId) {
                    const fromIndex = subtasks.findIndex((s) => s.id === draggedSubtaskId)
                    const toIndex = index
                    reorderSubtasks(fromIndex, toIndex)
                    setDraggedSubtaskId(null)
                  }
                }}
                onDragEnd={() => setDraggedSubtaskId(null)}
                className="group flex items-center gap-2 rounded-lg px-2 py-2 transition hover:bg-[var(--bg-elevated)] cursor-move"
              >
                <button
                  onClick={() => toggleSubtask(sub.id)}
                  className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full border-2 transition"
                  style={{
                    borderColor: sub.done ? 'var(--brand)' : 'var(--border)',
                    backgroundColor: sub.done ? 'var(--brand)' : 'transparent',
                  }}
                >
                  {sub.done && (
                    <Icon icon="lucide:check" width={12} height={12} className="text-white" />
                  )}
                </button>
                <span
                  className={`flex-1 text-sm transition ${sub.done ? 'text-[var(--text-disabled)] line-through opacity-60' : 'text-[var(--text-primary)]'}`}
                >
                  {sub.title}
                </span>
                <button
                  onClick={() => deleteSubtask(sub.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 rounded p-1 text-[var(--text-disabled)] hover:text-[var(--destructive)] transition"
                >
                  <Icon icon="lucide:x" width={12} height={12} />
                </button>
              </motion.div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
              placeholder="Add subtask..."
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
            />
            <button
              onClick={addSubtask}
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-medium text-white transition hover:opacity-90"
            >
              Add
            </button>
          </div>
        </div>

        {/* Comments Section */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Icon
              icon="lucide:message-square"
              width={16}
              height={16}
              className="text-[var(--brand)]"
            />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Comments ({comments.length})
            </h3>
          </div>
          <div className="space-y-3 mb-3 max-h-48 overflow-y-auto">
            {comments.map((comment) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3"
              >
                <p className="text-sm text-[var(--text-primary)] mb-1">{comment.text}</p>
                <span className="text-xs text-[var(--text-disabled)]">
                  {formatDate(comment.createdAt)}
                </span>
              </motion.div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addComment()}
              placeholder="Add a comment..."
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
            />
            <button
              onClick={addComment}
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-medium text-white transition hover:opacity-90"
            >
              Send
            </button>
          </div>
        </div>

        {/* Activity Log */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Icon icon="lucide:activity" width={16} height={16} className="text-[var(--brand)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Activity</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-xs">
              <Icon
                icon="lucide:circle"
                width={8}
                height={8}
                className="text-[var(--brand)] mt-1"
              />
              <div>
                <span className="text-[var(--text-secondary)]">Created </span>
                <span className="text-[var(--text-disabled)]">{formatDate(card.createdAt)}</span>
              </div>
            </div>
            {card.activity?.map((activity) => (
              <div key={activity.id} className="flex items-start gap-2 text-xs">
                <Icon
                  icon="lucide:circle"
                  width={8}
                  height={8}
                  className="text-[var(--brand)] mt-1"
                />
                <div>
                  <span className="text-[var(--text-secondary)]">{activity.action} </span>
                  <span className="text-[var(--text-disabled)]">
                    {formatDate(activity.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panel Footer */}
      <div className="shrink-0 border-t border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="rounded-xl bg-[var(--brand)] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Done
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-secondary)]">Delete card?</span>
              <button
                onClick={() => {
                  onDelete(card.id)
                  onClose()
                }}
                className="rounded-lg bg-[var(--destructive)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[var(--text-disabled)] transition hover:text-[var(--destructive)]"
            >
              <Icon icon="lucide:trash-2" width={14} height={14} />
              Delete
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Recommendations Panel ───────────────────────────────────────
function RecommendationsPanel({
  recommendations,
  boardHealth,
  collapsed,
  onToggle,
  onDismiss,
}: {
  recommendations: KanbanRecommendation[]
  boardHealth: BoardHealth
  collapsed: boolean
  onToggle: () => void
  onDismiss: (id: string) => void
}) {
  const categoryColors = {
    workflow: '#3b82f6',
    hygiene: '#f59e0b',
    productivity: '#22c55e',
    suggestion: '#a855f7',
  }

  const priorityBorderColors = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#3b82f6',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 text-left transition hover:bg-[var(--bg)]"
      >
        <div className="flex items-center gap-3">
          <Icon icon="lucide:lightbulb" width={20} height={20} className="text-[var(--brand)]" />
          <span className="text-base font-semibold text-[var(--text-primary)]">
            Recommendations
          </span>
          {recommendations.length > 0 && (
            <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[var(--brand)] px-2 text-xs font-bold text-white">
              {recommendations.length}
            </span>
          )}

          {/* Board Health */}
          <div className="flex items-center gap-2 ml-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: boardHealth.color }}
              title={`Board Health: ${boardHealth.score}%`}
            />
            <span className="text-sm font-medium" style={{ color: boardHealth.color }}>
              {boardHealth.score}%
            </span>
            <div className="relative group">
              <Icon
                icon="lucide:info"
                width={14}
                height={14}
                className="text-[var(--text-disabled)] cursor-help"
              />
              <div className="absolute left-0 top-full mt-2 z-50 hidden group-hover:block w-64 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-xl">
                <h4 className="text-xs font-semibold text-[var(--text-primary)] mb-2">
                  Health Breakdown
                </h4>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">WIP Control:</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {boardHealth.breakdown.wip}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Label Coverage:</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {boardHealth.breakdown.labels}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Descriptions:</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {boardHealth.breakdown.descriptions}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Fresh Cards:</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {boardHealth.breakdown.stale}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">On Time:</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {boardHealth.breakdown.overdue}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Icon
          icon={collapsed ? 'lucide:chevron-down' : 'lucide:chevron-up'}
          width={20}
          height={20}
          className="text-[var(--text-disabled)]"
        />
      </button>

      {/* Recommendations Cards */}
      {!collapsed && recommendations.length > 0 && (
        <div className="px-6 pb-4">
          <div
            className="flex gap-3 overflow-x-auto pb-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {recommendations.map((rec, index) => (
              <motion.div
                key={rec.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="group relative shrink-0 w-72 rounded-xl border bg-[var(--bg)] p-4 backdrop-blur-sm transition hover:shadow-md"
                style={{
                  borderLeftWidth: '3px',
                  borderLeftColor: priorityBorderColors[rec.priority],
                  borderColor: 'var(--border)',
                }}
              >
                {/* Dismiss button */}
                <button
                  onClick={() => onDismiss(rec.id)}
                  className="absolute top-2 right-2 rounded p-1 text-[var(--text-disabled)] opacity-0 group-hover:opacity-100 transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                >
                  <Icon icon="lucide:x" width={14} height={14} />
                </button>

                {/* Category pill */}
                <div
                  className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: categoryColors[rec.category] }}
                >
                  {rec.category}
                </div>

                <div className="mt-6 flex items-start gap-3">
                  <Icon
                    icon={rec.icon}
                    width={24}
                    height={24}
                    className="shrink-0 text-[var(--brand)]"
                  />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                      {rec.title}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                      {rec.description}
                    </p>
                    <button
                      onClick={rec.actionFn}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                    >
                      {rec.action}
                      <Icon icon="lucide:arrow-right" width={12} height={12} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {!collapsed && recommendations.length === 0 && (
        <div className="px-6 pb-4 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            <Icon
              icon="lucide:check-circle"
              width={16}
              height={16}
              className="inline mr-2 text-[var(--brand)]"
            />
            All caught up! No recommendations at the moment.
          </p>
        </div>
      )}
    </motion.div>
  )
}

// ── Column Editor Inline ────────────────────────────────────────
function ColumnEditor({
  column,
  onSave,
  onCancel,
}: {
  column?: KanbanColumn
  onSave: (title: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(column?.title || '')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(title.trim())
          if (e.key === 'Escape') onCancel()
        }}
        className="flex-1 rounded-lg border border-[var(--brand)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none"
        placeholder="Column name..."
      />
      <button
        onClick={() => onSave(title.trim())}
        className="rounded p-1 text-[var(--brand)] hover:bg-[var(--bg)]"
      >
        <Icon icon="lucide:check" width={14} height={14} />
      </button>
      <button
        onClick={onCancel}
        className="rounded p-1 text-[var(--text-disabled)] hover:text-[var(--text-primary)]"
      >
        <Icon icon="lucide:x" width={14} height={14} />
      </button>
    </div>
  )
}

// ── Main KanbanView ─────────────────────────────────────────────
export function KanbanView() {
  const [data, setData] = useState<KanbanData>(loadKanbanData)
  const [draggedCard, setDraggedCard] = useState<KanbanCard | null>(null)
  const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null)
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [newCardColumn, setNewCardColumn] = useState<string | null>(null)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterLabel, setFilterLabel] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<Priority | null>(null)
  const [editingBoardName, setEditingBoardName] = useState(false)
  const [boardNameDraft, setBoardNameDraft] = useState('')
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const [boardMenuOpen, setBoardMenuOpen] = useState(false)
  const boardMenuRef = useRef<HTMLDivElement>(null)
  const [dismissedRecs, setDismissedRecs] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(DISMISSED_RECS_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [recPanelCollapsed, setRecPanelCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      const stored = localStorage.getItem(REC_PANEL_STATE_KEY)
      return stored === 'true'
    } catch {
      return false
    }
  })
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [highlightedColumn, setHighlightedColumn] = useState<string | null>(null)
  const [showBoardTemplatePicker, setShowBoardTemplatePicker] = useState(false)
  const [cardTemplatePickerColumn, setCardTemplatePickerColumn] = useState<string | null>(null)
  const cardTemplatePickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    saveKanbanData(data)
  }, [data])

  // Save dismissed recommendations to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_RECS_KEY, JSON.stringify(dismissedRecs))
    } catch {
      /* noop */
    }
  }, [dismissedRecs])

  // Save recommendations panel state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(REC_PANEL_STATE_KEY, recPanelCollapsed.toString())
    } catch {
      /* noop */
    }
  }, [recPanelCollapsed])

  // Clear toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage])

  // Clear highlighted column after 2 seconds
  useEffect(() => {
    if (highlightedColumn) {
      const timer = setTimeout(() => setHighlightedColumn(null), 2000)
      return () => clearTimeout(timer)
    }
  }, [highlightedColumn])

  // Agent integration: listen for kanban-create-card events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | {
            title: string
            description?: string
            priority?: Priority
            columnId?: string
            labels?: string[]
            assignee?: string
            linkedBranch?: string
          }
        | undefined
      if (!detail?.title) return
      setData((prev) => {
        const board = prev.boards.find((b) => b.id === prev.activeBoard)
        if (!board) return prev
        const colId =
          detail.columnId && board.columns.some((c) => c.id === detail.columnId)
            ? detail.columnId!
            : board.columns[0]?.id || 'backlog'
        const colCards = board.cards.filter((c) => c.columnId === colId)
        const maxSort = colCards.reduce((max, c) => Math.max(max, c.sortOrder), 0)
        const newCard: KanbanCard = {
          id: genId('card'),
          title: detail.title,
          description: detail.description,
          labels: detail.labels || [],
          priority: detail.priority || 'P2',
          assignee: detail.assignee,
          createdAt: Date.now(),
          columnId: colId,
          sortOrder: maxSort + 1,
          subtasks: [],
          linkedBranch: detail.linkedBranch,
          comments: [],
          activity: [
            {
              id: genId('activity'),
              action: 'Created card',
              timestamp: Date.now(),
            },
          ],
        }
        return {
          ...prev,
          boards: prev.boards.map((b) =>
            b.id === prev.activeBoard ? { ...b, cards: [...b.cards, newCard] } : b,
          ),
        }
      })
    }
    window.addEventListener('kanban-create-card', handler)
    return () => window.removeEventListener('kanban-create-card', handler)
  }, [])

  // Close board menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boardMenuRef.current && !boardMenuRef.current.contains(e.target as Node)) {
        setBoardMenuOpen(false)
      }
    }
    if (boardMenuOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [boardMenuOpen])

  // Close card template picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        cardTemplatePickerRef.current &&
        !cardTemplatePickerRef.current.contains(e.target as Node)
      ) {
        setCardTemplatePickerColumn(null)
      }
    }
    if (cardTemplatePickerColumn) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [cardTemplatePickerColumn])

  const activeBoard = useMemo(() => {
    return data.boards.find((b) => b.id === data.activeBoard) || data.boards[0]
  }, [data])

  const selectedCard = useMemo(() => {
    if (!selectedCardId) return null
    return activeBoard.cards.find((c) => c.id === selectedCardId) || null
  }, [selectedCardId, activeBoard.cards])

  const filteredCards = useMemo(() => {
    let cards = activeBoard.cards
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      cards = cards.filter(
        (card) =>
          card.title.toLowerCase().includes(query) ||
          card.description?.toLowerCase().includes(query),
      )
    }
    if (filterLabel) {
      cards = cards.filter((card) => card.labels.includes(filterLabel))
    }
    if (filterPriority) {
      cards = cards.filter((card) => card.priority === filterPriority)
    }
    return cards
  }, [activeBoard.cards, searchQuery, filterLabel, filterPriority])

  const getColumnCards = useCallback(
    (columnId: string) => {
      return filteredCards
        .filter((card) => card.columnId === columnId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    },
    [filteredCards],
  )

  const updateBoard = useCallback((updates: Partial<KanbanBoard>) => {
    setData((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => (b.id === prev.activeBoard ? { ...b, ...updates } : b)),
    }))
  }, [])

  const addCard = useCallback((columnId: string, title: string) => {
    if (!title.trim()) return
    setData((prev) => {
      const board = prev.boards.find((b) => b.id === prev.activeBoard)
      const colCards = board?.cards.filter((c) => c.columnId === columnId) || []
      const maxSort = colCards.reduce((max, c) => Math.max(max, c.sortOrder), 0)
      const newCard: KanbanCard = {
        id: genId('card'),
        title: title.trim(),
        labels: [],
        priority: 'P2',
        createdAt: Date.now(),
        columnId,
        sortOrder: maxSort + 1,
        subtasks: [],
        comments: [],
        activity: [
          {
            id: genId('activity'),
            action: 'Created card',
            timestamp: Date.now(),
          },
        ],
      }
      return {
        ...prev,
        boards: prev.boards.map((b) =>
          b.id === prev.activeBoard ? { ...b, cards: [...b.cards, newCard] } : b,
        ),
      }
    })
    setNewCardColumn(null)
    setNewCardTitle('')
  }, [])

  const addCardFromTemplate = useCallback((columnId: string, templateId: string) => {
    const template = CARD_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return

    let newCardId: string = ''

    setData((prev) => {
      const board = prev.boards.find((b) => b.id === prev.activeBoard)
      if (!board) return prev

      const colCards = board.cards.filter((c) => c.columnId === columnId)
      const maxSort = colCards.reduce((max, c) => Math.max(max, c.sortOrder), 0)

      // Ensure all labels from template exist in board
      const existingLabelIds = new Set(board.labels.map((l) => l.id))
      const missingLabels = template.labels
        .filter((labelId) => !existingLabelIds.has(labelId))
        .map((labelId) => DEFAULT_LABELS.find((l) => l.id === labelId))
        .filter((l): l is Label => l !== undefined)

      newCardId = genId('card')
      const newCard: KanbanCard = {
        id: newCardId,
        title: template.title,
        description: template.description,
        labels: template.labels,
        priority: template.priority,
        createdAt: Date.now(),
        columnId,
        sortOrder: maxSort + 1,
        subtasks: template.subtasks.map((title) => ({
          id: genId('sub'),
          title,
          done: false,
        })),
        comments: [],
        activity: [
          {
            id: genId('activity'),
            action: 'Created card',
            timestamp: Date.now(),
          },
        ],
      }

      return {
        ...prev,
        boards: prev.boards.map((b) =>
          b.id === prev.activeBoard
            ? {
                ...b,
                cards: [...b.cards, newCard],
                labels: [...b.labels, ...missingLabels],
              }
            : b,
        ),
      }
    })

    setCardTemplatePickerColumn(null)
    setSelectedCardId(newCardId)
  }, [])

  const moveCard = useCallback(
    (cardId: string, toColumnId: string, insertBeforeCardId?: string) => {
      setData((prev) => {
        const board = prev.boards.find((b) => b.id === prev.activeBoard)
        if (!board) return prev

        const card = board.cards.find((c) => c.id === cardId)
        if (!card) return prev

        const targetCards = board.cards
          .filter((c) => c.columnId === toColumnId && c.id !== cardId)
          .sort((a, b) => a.sortOrder - b.sortOrder)

        let newOrder: number
        if (insertBeforeCardId) {
          const idx = targetCards.findIndex((c) => c.id === insertBeforeCardId)
          if (idx === 0) {
            newOrder = targetCards[0].sortOrder - 1
          } else if (idx > 0) {
            newOrder = (targetCards[idx - 1].sortOrder + targetCards[idx].sortOrder) / 2
          } else {
            newOrder =
              targetCards.length > 0 ? targetCards[targetCards.length - 1].sortOrder + 1 : 0
          }
        } else {
          newOrder = targetCards.length > 0 ? targetCards[targetCards.length - 1].sortOrder + 1 : 0
        }

        return {
          ...prev,
          boards: prev.boards.map((b) =>
            b.id === prev.activeBoard
              ? {
                  ...b,
                  cards: b.cards.map((c) =>
                    c.id === cardId ? { ...c, columnId: toColumnId, sortOrder: newOrder } : c,
                  ),
                }
              : b,
          ),
        }
      })
    },
    [],
  )

  const deleteCard = useCallback((cardId: string) => {
    setData((prev) => ({
      ...prev,
      boards: prev.boards.map((b) =>
        b.id === prev.activeBoard ? { ...b, cards: b.cards.filter((c) => c.id !== cardId) } : b,
      ),
    }))
  }, [])

  const updateCard = useCallback((cardId: string, updates: Partial<KanbanCard>) => {
    setData((prev) => ({
      ...prev,
      boards: prev.boards.map((b) =>
        b.id === prev.activeBoard
          ? { ...b, cards: b.cards.map((c) => (c.id === cardId ? { ...c, ...updates } : c)) }
          : b,
      ),
    }))
  }, [])

  const toggleColumn = useCallback((columnId: string) => {
    setData((prev) => ({
      ...prev,
      boards: prev.boards.map((b) =>
        b.id === prev.activeBoard
          ? {
              ...b,
              columns: b.columns.map((col) =>
                col.id === columnId ? { ...col, collapsed: !col.collapsed } : col,
              ),
            }
          : b,
      ),
    }))
  }, [])

  // ── Board management ──────────────────────────────────────────
  const createBoard = useCallback(() => {
    const newBoard: KanbanBoard = {
      id: genId('board'),
      name: 'New Board',
      cards: [],
      columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
      labels: DEFAULT_LABELS.map((l) => ({ ...l })),
    }
    setData((prev) => ({
      boards: [...prev.boards, newBoard],
      activeBoard: newBoard.id,
    }))
    setBoardMenuOpen(false)
  }, [])

  const createBoardFromTemplate = useCallback((templateId: string) => {
    const template = BOARD_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return

    const boardId = genId('board')

    // Create columns with unique IDs and collapsed state
    const columns: KanbanColumn[] = template.columns.map((col) => ({
      ...col,
      id: `${boardId}-${col.id}`,
      collapsed: false,
    }))

    // Collect all label IDs referenced in template cards
    const referencedLabelIds = new Set<string>()
    template.cards.forEach((card) => {
      card.labels.forEach((labelId) => referencedLabelIds.add(labelId))
    })

    // Include all referenced labels from defaults
    const labels: Label[] = DEFAULT_LABELS.filter((label) => referencedLabelIds.has(label.id))

    // Create cards with proper IDs, timestamps, and column mappings
    const cards: KanbanCard[] = template.cards.map((card, index) => ({
      id: genId('card'),
      title: card.title,
      description: card.description,
      labels: card.labels,
      priority: card.priority,
      subtasks: card.subtasks.map((title) => ({
        id: genId('sub'),
        title,
        done: false,
      })),
      columnId: `${boardId}-${card.columnId}`,
      sortOrder: index,
      createdAt: Date.now(),
      comments: [],
      activity: [
        {
          id: genId('activity'),
          action: 'Created card',
          timestamp: Date.now(),
        },
      ],
    }))

    const newBoard: KanbanBoard = {
      id: boardId,
      name: template.name,
      cards,
      columns,
      labels,
    }

    setData((prev) => ({
      boards: [...prev.boards, newBoard],
      activeBoard: newBoard.id,
    }))
    setShowBoardTemplatePicker(false)
    setBoardMenuOpen(false)
  }, [])

  const switchBoard = useCallback((boardId: string) => {
    setData((prev) => ({ ...prev, activeBoard: boardId }))
    setBoardMenuOpen(false)
    setSelectedCardId(null)
  }, [])

  const deleteBoard = useCallback((boardId: string) => {
    setData((prev) => {
      const remaining = prev.boards.filter((b) => b.id !== boardId)
      if (remaining.length === 0) return prev
      return {
        boards: remaining,
        activeBoard: prev.activeBoard === boardId ? remaining[0].id : prev.activeBoard,
      }
    })
  }, [])

  const renameBoardInline = useCallback(() => {
    if (!boardNameDraft.trim()) {
      setEditingBoardName(false)
      return
    }
    updateBoard({ name: boardNameDraft.trim() })
    setEditingBoardName(false)
  }, [boardNameDraft, updateBoard])

  // ── Column management ─────────────────────────────────────────
  const renameColumn = useCallback(
    (columnId: string, newTitle: string) => {
      if (!newTitle) {
        setEditingColumnId(null)
        return
      }
      updateBoard({
        columns: activeBoard.columns.map((c) =>
          c.id === columnId ? { ...c, title: newTitle } : c,
        ),
      })
      setEditingColumnId(null)
    },
    [activeBoard.columns, updateBoard],
  )

  const deleteColumn = useCallback(
    (columnId: string) => {
      if (activeBoard.columns.length <= 1) return
      const fallback = activeBoard.columns.find((c) => c.id !== columnId)!.id
      setData((prev) => ({
        ...prev,
        boards: prev.boards.map((b) =>
          b.id === prev.activeBoard
            ? {
                ...b,
                columns: b.columns.filter((c) => c.id !== columnId),
                cards: b.cards.map((c) =>
                  c.columnId === columnId ? { ...c, columnId: fallback } : c,
                ),
              }
            : b,
        ),
      }))
    },
    [activeBoard.columns],
  )

  // ── Drag handlers ─────────────────────────────────────────────
  const handleDragStart = useCallback((card: KanbanCard) => {
    setDraggedCard(card)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    setDraggedOverColumn(columnId)
  }, [])

  const handleDrop = useCallback(
    (columnId: string) => {
      if (draggedCard) {
        moveCard(draggedCard.id, columnId, dragOverCardId || undefined)
        setDraggedCard(null)
        setDraggedOverColumn(null)
        setDragOverCardId(null)
      }
    },
    [draggedCard, dragOverCardId, moveCard],
  )

  const handleDragEnd = useCallback(() => {
    setDraggedCard(null)
    setDraggedOverColumn(null)
    setDragOverCardId(null)
  }, [])

  const handleCardDragOver = useCallback((e: React.DragEvent, cardId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverCardId(cardId)
  }, [])

  const getLabelById = useCallback(
    (labelId: string) => activeBoard.labels.find((l) => l.id === labelId),
    [activeBoard.labels],
  )

  // ── Recommendations & Board Health ───────────────────────────
  const boardHealth = useMemo(
    () => calculateBoardHealth(activeBoard.cards, activeBoard.columns),
    [activeBoard.cards, activeBoard.columns],
  )

  const clearDoneColumn = useCallback(() => {
    if (confirm('Are you sure you want to clear all cards in the Done column?')) {
      setData((prev) => ({
        ...prev,
        boards: prev.boards.map((b) =>
          b.id === prev.activeBoard
            ? { ...b, cards: b.cards.filter((c) => c.columnId !== 'done') }
            : b,
        ),
      }))
      setToastMessage('Done column cleared!')
    }
  }, [])

  const recommendations = useMemo(() => {
    return generateRecommendations(activeBoard.cards, activeBoard.columns, dismissedRecs, {
      onHighlightColumn: (colId: string) => {
        setHighlightedColumn(colId)
        setToastMessage(
          `Viewing ${activeBoard.columns.find((c) => c.id === colId)?.title || colId} column`,
        )
      },
      onOpenCard: (cardId: string) => {
        setSelectedCardId(cardId)
      },
      onNewCard: () => {
        const firstCol = activeBoard.columns[0]
        if (firstCol) {
          setNewCardColumn(firstCol.id)
        }
      },
      onClearDone: clearDoneColumn,
      onShowToast: (msg: string) => {
        setToastMessage(msg)
      },
    })
  }, [activeBoard.cards, activeBoard.columns, dismissedRecs, clearDoneColumn])

  const dismissRecommendation = useCallback((id: string) => {
    setDismissedRecs((prev) => [...prev, id])
  }, [])

  const toggleRecPanel = useCallback(() => {
    setRecPanelCollapsed((prev) => !prev)
  }, [])

  return (
    <div className="relative h-full w-full flex flex-col min-h-0 bg-[var(--sidebar-bg)]">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Icon icon="lucide:kanban" width={24} height={24} className="text-[var(--brand)]" />

            {/* Board name — editable */}
            {editingBoardName ? (
              <input
                autoFocus
                value={boardNameDraft}
                onChange={(e) => setBoardNameDraft(e.target.value)}
                onBlur={renameBoardInline}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameBoardInline()
                  if (e.key === 'Escape') setEditingBoardName(false)
                }}
                className="rounded-lg border border-[var(--brand)] bg-[var(--bg)] px-2 py-1 text-xl font-semibold text-[var(--text-primary)] outline-none"
              />
            ) : (
              <h1
                className="text-xl font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--brand)] transition"
                onDoubleClick={() => {
                  setBoardNameDraft(activeBoard.name)
                  setEditingBoardName(true)
                }}
              >
                {activeBoard.name}
              </h1>
            )}

            {/* Board switcher */}
            {data.boards.length > 1 && (
              <div className="relative" ref={boardMenuRef}>
                <button
                  onClick={() => setBoardMenuOpen((v) => !v)}
                  className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg)] hover:text-[var(--text-primary)]"
                >
                  <Icon icon="lucide:chevron-down" width={16} height={16} />
                </button>
                {boardMenuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl py-1">
                    {data.boards.map((b) => (
                      <div
                        key={b.id}
                        className={`flex items-center justify-between px-3 py-2 text-sm transition hover:bg-[var(--bg)] ${
                          b.id === data.activeBoard
                            ? 'text-[var(--brand)] font-medium'
                            : 'text-[var(--text-primary)]'
                        }`}
                      >
                        <button
                          onClick={() => switchBoard(b.id)}
                          className="flex-1 text-left truncate"
                        >
                          {b.name}
                          <span className="ml-2 text-xs text-[var(--text-disabled)]">
                            ({b.cards.length})
                          </span>
                        </button>
                        {data.boards.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteBoard(b.id)
                            }}
                            className="shrink-0 rounded p-1 text-[var(--text-disabled)] hover:text-[var(--destructive)] transition"
                          >
                            <Icon icon="lucide:trash-2" width={12} height={12} />
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="border-t border-[var(--border)] mt-1 pt-1">
                      <button
                        onClick={() => {
                          setBoardMenuOpen(false)
                          setShowBoardTemplatePicker(true)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg)] hover:text-[var(--text-primary)]"
                      >
                        <Icon icon="lucide:plus" width={14} height={14} />
                        New Board
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBoardTemplatePicker(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--brand)]"
            >
              <Icon icon="lucide:plus" width={16} height={16} />
              New Board
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Icon
              icon="lucide:search"
              width={16}
              height={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cards..."
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2 pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
            />
          </div>
          <select
            value={filterPriority || ''}
            onChange={(e) => setFilterPriority((e.target.value as Priority) || null)}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
          >
            <option value="">All Priorities</option>
            {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {p} - {PRIORITY_CONFIG[p].label}
              </option>
            ))}
          </select>
          <select
            value={filterLabel || ''}
            onChange={(e) => setFilterLabel(e.target.value || null)}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
          >
            <option value="">All Labels</option>
            {activeBoard.labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
          {(searchQuery || filterLabel || filterPriority) && (
            <button
              onClick={() => {
                setSearchQuery('')
                setFilterLabel(null)
                setFilterPriority(null)
              }}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Recommendations Panel */}
      <div className="px-6 pt-4">
        <RecommendationsPanel
          recommendations={recommendations}
          boardHealth={boardHealth}
          collapsed={recPanelCollapsed}
          onToggle={toggleRecPanel}
          onDismiss={dismissRecommendation}
        />
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden min-h-0 px-6 py-6">
        <div className="flex gap-4 h-full w-full">
          {activeBoard.columns.map((column) => {
            const cards = getColumnCards(column.id)
            const isCollapsed = column.collapsed
            const isDraggedOver = draggedOverColumn === column.id
            const isHighlighted = highlightedColumn === column.id

            return (
              <motion.div
                key={column.id}
                animate={{
                  scale: isHighlighted ? 1.02 : 1,
                  boxShadow: isHighlighted
                    ? '0 0 0 3px var(--brand), 0 10px 40px rgba(0,0,0,0.2)'
                    : isDraggedOver
                      ? '0 0 0 2px var(--brand)'
                      : undefined,
                }}
                transition={{ duration: 0.2 }}
                className="flex flex-col flex-1 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] transition overflow-hidden"
                style={{
                  minHeight: isCollapsed ? 'auto' : '500px',
                }}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDrop={() => handleDrop(column.id)}
              >
                {/* Colored accent line at top */}
                <div className="h-1" style={{ backgroundColor: column.color }} />

                {/* Column Header */}
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  {editingColumnId === column.id ? (
                    <div className="flex-1">
                      <ColumnEditor
                        column={column}
                        onSave={(title) => renameColumn(column.id, title)}
                        onCancel={() => setEditingColumnId(null)}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => toggleColumn(column.id)}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      <Icon
                        icon={column.icon}
                        width={16}
                        height={16}
                        className="shrink-0"
                        style={{ color: column.color }}
                      />
                      <span className="text-base font-semibold text-[var(--text-primary)]">
                        {column.title}
                      </span>
                      <span
                        className={`flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-xs font-bold ${
                          column.wipLimit && cards.length > column.wipLimit
                            ? 'bg-[#ef4444] text-white'
                            : 'bg-[var(--bg)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {cards.length}
                        {column.wipLimit && `/${column.wipLimit}`}
                      </span>
                    </button>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingColumnId(column.id)
                      }}
                      className="rounded p-1 text-[var(--text-disabled)] hover:text-[var(--text-primary)] transition"
                      title="Rename column"
                    >
                      <Icon icon="lucide:edit-2" width={12} height={12} />
                    </button>
                    {activeBoard.columns.length > 1 && (
                      <button
                        onClick={() => deleteColumn(column.id)}
                        className="rounded p-1 text-[var(--text-disabled)] hover:text-[var(--destructive)] transition"
                        title="Delete column"
                      >
                        <Icon icon="lucide:trash-2" width={12} height={12} />
                      </button>
                    )}
                    <Icon
                      icon={isCollapsed ? 'lucide:chevron-right' : 'lucide:chevron-down'}
                      width={16}
                      height={16}
                      className="text-[var(--text-disabled)] cursor-pointer"
                      onClick={() => toggleColumn(column.id)}
                    />
                  </div>
                </div>

                {!isCollapsed && (
                  <>
                    {/* Cards */}
                    <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                      <AnimatePresence>
                        {cards.map((card) => {
                          const dueDateStatus = getDueDateStatus(card.dueDate)
                          const subtasksDone = card.subtasks.filter((s) => s.done).length
                          const subtasksTotal = card.subtasks.length

                          return (
                            <motion.div
                              key={card.id}
                              layout
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              draggable
                              onDragStart={() => handleDragStart(card)}
                              onDragOver={(e) => handleCardDragOver(e, card.id)}
                              onDragEnd={handleDragEnd}
                              onClick={() => setSelectedCardId(card.id)}
                              className={`group relative rounded-xl border bg-[var(--bg)] p-3 cursor-pointer transition hover:border-[var(--brand)]/60 hover:shadow-sm ${
                                dragOverCardId === card.id
                                  ? 'border-t-2 border-t-[var(--brand)] border-[var(--border)]'
                                  : 'border-[var(--border)]'
                              }`}
                              style={{
                                borderLeftColor: PRIORITY_CONFIG[card.priority].color,
                                borderLeftWidth: '3px',
                              }}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <h3 className="text-sm font-semibold text-[var(--text-primary)] break-words flex-1 leading-snug">
                                  {card.title}
                                </h3>
                                {card.assignee && (
                                  <div
                                    className="flex shrink-0 items-center justify-center w-7 h-7 rounded-full bg-[var(--brand)] text-white text-xs font-semibold"
                                    title={card.assignee}
                                  >
                                    {card.assignee.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>

                              {card.labels.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {card.labels.slice(0, 3).map((labelId) => {
                                    const label = getLabelById(labelId)
                                    if (!label) return null
                                    return (
                                      <span
                                        key={labelId}
                                        className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                                        style={{ backgroundColor: label.color }}
                                      >
                                        {label.name}
                                      </span>
                                    )
                                  })}
                                  {card.labels.length > 3 && (
                                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-[var(--border)] text-[var(--text-disabled)]">
                                      +{card.labels.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Subtask progress */}
                              {subtasksTotal > 0 && (
                                <div className="mt-2 flex items-center gap-2">
                                  <div className="flex-1 h-1 rounded-full bg-[var(--border)] overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-[var(--brand)] transition-all"
                                      style={{ width: `${(subtasksDone / subtasksTotal) * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-[var(--text-disabled)]">
                                    {subtasksDone}/{subtasksTotal}
                                  </span>
                                </div>
                              )}

                              <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-disabled)]">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="flex items-center gap-0.5"
                                    style={{ color: PRIORITY_CONFIG[card.priority].color }}
                                  >
                                    <Icon
                                      icon={PRIORITY_CONFIG[card.priority].icon}
                                      width={10}
                                      height={10}
                                    />
                                    {PRIORITY_CONFIG[card.priority].label}
                                  </span>
                                  {card.assignee && (
                                    <span className="flex items-center gap-1">
                                      <Icon icon="lucide:user" width={10} height={10} />
                                      {card.assignee}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {card.linkedBranch && (
                                    <span className="flex items-center gap-0.5">
                                      <Icon
                                        icon="lucide:git-branch"
                                        width={10}
                                        height={10}
                                        className="text-[var(--brand)]"
                                      />
                                    </span>
                                  )}
                                  {card.dueDate && (
                                    <span
                                      className={`flex items-center gap-0.5 ${
                                        dueDateStatus === 'overdue'
                                          ? 'text-[#ef4444] font-medium'
                                          : dueDateStatus === 'soon'
                                            ? 'text-[#f59e0b] font-medium'
                                            : ''
                                      }`}
                                    >
                                      <Icon icon="lucide:calendar" width={10} height={10} />
                                      {formatDate(card.dueDate)}
                                    </span>
                                  )}
                                  {!card.dueDate && <span>{formatDate(card.createdAt)}</span>}
                                </div>
                              </div>
                            </motion.div>
                          )
                        })}
                      </AnimatePresence>

                      {newCardColumn === column.id && (
                        <div className="rounded-xl border border-[var(--brand)] bg-[var(--bg)] p-3">
                          <input
                            autoFocus
                            type="text"
                            value={newCardTitle}
                            onChange={(e) => setNewCardTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addCard(column.id, newCardTitle)
                              else if (e.key === 'Escape') {
                                setNewCardColumn(null)
                                setNewCardTitle('')
                              }
                            }}
                            placeholder="Card title..."
                            className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => addCard(column.id, newCardTitle)}
                              className="rounded-lg bg-[var(--brand)] px-3 py-1 text-xs font-medium text-[var(--brand-contrast)] transition hover:opacity-90"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => {
                                setNewCardColumn(null)
                                setNewCardTitle('')
                              }}
                              className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Add Card Button */}
                    {newCardColumn !== column.id && (
                      <div className="mx-3 mb-3 flex items-center gap-1">
                        <button
                          onClick={() => setNewCardColumn(column.id)}
                          className="flex-1 flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:border-[var(--brand)] hover:text-[var(--text-primary)]"
                        >
                          <Icon icon="lucide:plus" width={16} height={16} />
                          Add card
                        </button>
                        <div className="relative">
                          <button
                            onClick={() =>
                              setCardTemplatePickerColumn(
                                cardTemplatePickerColumn === column.id ? null : column.id,
                              )
                            }
                            className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-2 text-[var(--text-secondary)] transition hover:border-[var(--brand)] hover:text-[var(--text-primary)]"
                          >
                            <Icon icon="lucide:chevron-down" width={16} height={16} />
                          </button>
                          {cardTemplatePickerColumn === column.id && (
                            <div
                              ref={cardTemplatePickerRef}
                              className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl py-1 backdrop-blur-sm"
                            >
                              {CARD_TEMPLATES.map((template) => (
                                <button
                                  key={template.id}
                                  onClick={() => addCardFromTemplate(column.id, template.id)}
                                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-[var(--bg)]"
                                >
                                  <Icon
                                    icon={template.icon}
                                    width={18}
                                    height={18}
                                    className="text-[var(--text-secondary)]"
                                  />
                                  <span className="flex-1 text-[var(--text-primary)] font-medium">
                                    {template.name}
                                  </span>
                                  <div
                                    className="rounded px-1.5 py-0.5 text-xs font-medium"
                                    style={{
                                      backgroundColor: `${PRIORITY_CONFIG[template.priority].color}20`,
                                      color: PRIORITY_CONFIG[template.priority].color,
                                    }}
                                  >
                                    {template.priority}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Card Detail Side Panel */}
      <AnimatePresence>
        {selectedCard && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-black"
              onClick={() => setSelectedCardId(null)}
            />
            <CardDetailPanel
              key="detail"
              card={selectedCard}
              columns={activeBoard.columns}
              labels={activeBoard.labels}
              onUpdate={updateCard}
              onDelete={deleteCard}
              onClose={() => setSelectedCardId(null)}
            />
          </>
        )}
      </AnimatePresence>

      {/* Board Template Picker */}
      <AnimatePresence>
        {showBoardTemplatePicker && (
          <>
            <motion.div
              key="template-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black"
              onClick={() => setShowBoardTemplatePicker(false)}
            />
            <motion.div
              key="template-picker"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6"
            >
              <div
                className="w-full max-w-4xl rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl backdrop-blur-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-[var(--border)] px-6 py-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                      Choose a Template
                    </h2>
                    <button
                      onClick={() => setShowBoardTemplatePicker(false)}
                      className="rounded-lg p-1 text-[var(--text-secondary)] transition hover:bg-[var(--bg)] hover:text-[var(--text-primary)]"
                    >
                      <Icon icon="lucide:x" width={20} height={20} />
                    </button>
                  </div>
                </div>

                <div className="p-6 max-h-[70vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                    {BOARD_TEMPLATES.map((template) => (
                      <motion.button
                        key={template.id}
                        onClick={() => createBoardFromTemplate(template.id)}
                        whileHover={{ scale: 1.02 }}
                        className="group relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5 text-left transition hover:border-[var(--brand)] hover:shadow-lg"
                      >
                        <div className="flex items-start gap-4">
                          <div className="shrink-0 rounded-lg bg-[var(--brand)]/10 p-3">
                            <Icon
                              icon={template.icon}
                              width={24}
                              height={24}
                              className="text-[var(--brand)]"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-[var(--text-primary)] mb-1">
                              {template.name}
                            </h3>
                            <p className="text-sm text-[var(--text-secondary)] mb-3">
                              {template.description}
                            </p>
                            <div className="flex items-center gap-2">
                              <div className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                                {template.cards.length} cards
                              </div>
                              <div className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                                {template.columns.length} columns
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-3 shadow-2xl backdrop-blur-sm"
          >
            <div className="flex items-center gap-2">
              <Icon icon="lucide:info" width={16} height={16} className="text-[var(--brand)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">{toastMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
