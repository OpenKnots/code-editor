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

const STORAGE_KEY = 'knot-code:kanban:boards'

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
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
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

  useEffect(() => {
    saveKanbanData(data)
  }, [data])

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

  return (
    <div className="h-full w-full flex flex-col min-h-0 bg-[var(--sidebar-bg)]">
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
                        onClick={createBoard}
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
              onClick={createBoard}
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

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden min-h-0 px-6 py-6">
        <div className="flex gap-4 h-full w-full">
          {activeBoard.columns.map((column) => {
            const cards = getColumnCards(column.id)
            const isCollapsed = column.collapsed
            const isDraggedOver = draggedOverColumn === column.id

            return (
              <div
                key={column.id}
                className="flex flex-col flex-1 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] transition overflow-hidden"
                style={{
                  minHeight: isCollapsed ? 'auto' : '500px',
                  boxShadow: isDraggedOver ? '0 0 0 2px var(--brand)' : undefined,
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
                      <button
                        onClick={() => setNewCardColumn(column.id)}
                        className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:border-[var(--brand)] hover:text-[var(--text-primary)]"
                      >
                        <Icon icon="lucide:plus" width={16} height={16} />
                        Add card
                      </button>
                    )}
                  </>
                )}
              </div>
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
              className="fixed inset-0 z-40 bg-black"
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
    </div>
  )
}
