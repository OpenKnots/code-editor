/**
 * Agent Activity Log — structured tracking of agent actions during execution.
 * Replaces simple string[] thinkingTrail with typed activities.
 */

export type ActivityType = 'read' | 'edit' | 'search' | 'command' | 'think' | 'write' | 'create'

export interface AgentActivity {
  id: string
  type: ActivityType
  label: string
  file?: string
  detail?: string
  timestamp: number
  status: 'running' | 'done' | 'error'
}

export interface AgentActivitySummary {
  filesRead: string[]
  filesEdited: string[]
  filesCreated: string[]
  commandsRun: number
  searchesPerformed: number
  totalActions: number
}

/**
 * Parse a tool_use event into an AgentActivity.
 */
export function parseToolActivity(
  toolName: string,
  input?: Record<string, unknown>,
): AgentActivity {
  const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
  const timestamp = Date.now()

  const path = (input?.path || input?.file_path || input?.file || '') as string
  const fileName = path ? path.split('/').pop() || path : ''

  if (toolName === 'read' || toolName === 'Read') {
    return {
      id, type: 'read', label: `Read ${fileName || 'file'}`,
      file: path || undefined, timestamp, status: 'done',
    }
  }

  if (toolName === 'write' || toolName === 'Write') {
    const isNew = !input?.old_string && !input?.oldText
    return {
      id, type: isNew ? 'create' : 'write',
      label: isNew ? `Create ${fileName}` : `Write ${fileName}`,
      file: path || undefined, timestamp, status: 'done',
    }
  }

  if (toolName === 'edit' || toolName === 'Edit') {
    return {
      id, type: 'edit', label: `Edit ${fileName || 'file'}`,
      file: path || undefined, timestamp, status: 'done',
    }
  }

  if (toolName.includes('search') || toolName === 'Grep' || toolName === 'grep') {
    const query = (input?.query || input?.pattern || '') as string
    return {
      id, type: 'search',
      label: `Search ${query ? `"${query.slice(0, 30)}"` : 'files'}`,
      detail: query, timestamp, status: 'done',
    }
  }

  if (toolName.includes('exec') || toolName === 'Bash' || toolName === 'bash') {
    const cmd = (input?.command || '') as string
    return {
      id, type: 'command',
      label: cmd ? `Run \`${cmd.split('\n')[0].slice(0, 40)}\`` : 'Run command',
      detail: cmd, timestamp, status: 'done',
    }
  }

  return {
    id, type: 'think', label: toolName,
    timestamp, status: 'done',
  }
}

/**
 * Summarize activities into a file-change overview.
 */
export function summarizeActivities(activities: AgentActivity[]): AgentActivitySummary {
  const filesRead = new Set<string>()
  const filesEdited = new Set<string>()
  const filesCreated = new Set<string>()
  let commandsRun = 0
  let searchesPerformed = 0

  for (const a of activities) {
    if (a.file) {
      if (a.type === 'read') filesRead.add(a.file)
      if (a.type === 'edit' || a.type === 'write') filesEdited.add(a.file)
      if (a.type === 'create') filesCreated.add(a.file)
    }
    if (a.type === 'command') commandsRun++
    if (a.type === 'search') searchesPerformed++
  }

  return {
    filesRead: [...filesRead],
    filesEdited: [...filesEdited],
    filesCreated: [...filesCreated],
    commandsRun,
    searchesPerformed,
    totalActions: activities.length,
  }
}

/**
 * Icon for an activity type.
 */
export function activityIcon(type: ActivityType): string {
  switch (type) {
    case 'read': return 'lucide:file-search'
    case 'edit': return 'lucide:file-pen-line'
    case 'write': return 'lucide:file-pen-line'
    case 'create': return 'lucide:file-plus'
    case 'search': return 'lucide:search'
    case 'command': return 'lucide:terminal'
    case 'think': return 'lucide:brain'
  }
}

/**
 * Color class for an activity type.
 */
export function activityColor(type: ActivityType): string {
  switch (type) {
    case 'read': return 'text-blue-400'
    case 'edit': return 'text-amber-400'
    case 'write': return 'text-amber-400'
    case 'create': return 'text-green-400'
    case 'search': return 'text-purple-400'
    case 'command': return 'text-cyan-400'
    case 'think': return 'text-[var(--text-disabled)]'
  }
}
