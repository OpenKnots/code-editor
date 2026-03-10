'use client'

import { useState, useMemo, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getMcpServers,
  addMcpServer,
  updateMcpServer,
  removeMcpServer,
} from '@/lib/mcp/storage'
import type { McpServerConfig, McpServerType } from '@/lib/mcp/types'

// ─── MCP Catalog ───────────────────────────────────────────────────────────

interface McpCatalogEntry {
  id: string
  name: string
  description: string
  icon: string
  category: string
  tags: string[]
  command: string
  type: McpServerType
  featured?: boolean
}

const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    icon: 'simple-icons:postgresql',
    category: 'databases',
    tags: ['database', 'sql', 'postgres'],
    command: 'npx @modelcontextprotocol/server-postgres',
    type: 'stdio',
    featured: true,
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read, write, and manage local files',
    icon: 'lucide:folder',
    category: 'dev',
    tags: ['files', 'filesystem', 'io'],
    command: 'npx @modelcontextprotocol/server-filesystem',
    type: 'stdio',
    featured: true,
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Search the web with Brave Search API',
    icon: 'simple-icons:brave',
    category: 'apis',
    tags: ['search', 'web', 'brave'],
    command: 'npx @modelcontextprotocol/server-brave-search',
    type: 'stdio',
    featured: true,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Manage repos, issues, PRs, and more',
    icon: 'lucide:github',
    category: 'dev',
    tags: ['github', 'git', 'code'],
    command: 'npx @modelcontextprotocol/server-github',
    type: 'stdio',
    featured: true,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send messages and manage Slack workspaces',
    icon: 'simple-icons:slack',
    category: 'apis',
    tags: ['slack', 'messaging', 'chat'],
    command: 'npx @modelcontextprotocol/server-slack',
    type: 'stdio',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Manage issues and projects in Linear',
    icon: 'simple-icons:linear',
    category: 'apis',
    tags: ['linear', 'projects', 'issues'],
    command: 'npx @modelcontextprotocol/server-linear',
    type: 'stdio',
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query and manage SQLite databases',
    icon: 'simple-icons:sqlite',
    category: 'databases',
    tags: ['database', 'sql', 'sqlite'],
    command: 'npx @modelcontextprotocol/server-sqlite',
    type: 'stdio',
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent memory and knowledge graph',
    icon: 'lucide:brain',
    category: 'dev',
    tags: ['memory', 'knowledge', 'graph'],
    command: 'npx @modelcontextprotocol/server-memory',
    type: 'stdio',
    featured: true,
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    icon: 'simple-icons:puppeteer',
    category: 'dev',
    tags: ['browser', 'automation', 'scraping'],
    command: 'npx @modelcontextprotocol/server-puppeteer',
    type: 'stdio',
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'HTTP requests and API calls',
    icon: 'lucide:globe',
    category: 'apis',
    tags: ['http', 'fetch', 'api'],
    command: 'npx @modelcontextprotocol/server-fetch',
    type: 'stdio',
  },
  {
    id: 'redis',
    name: 'Redis',
    description: 'In-memory data store and cache',
    icon: 'simple-icons:redis',
    category: 'databases',
    tags: ['redis', 'cache', 'database'],
    command: 'npx @modelcontextprotocol/server-redis',
    type: 'stdio',
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'Document database for modern apps',
    icon: 'simple-icons:mongodb',
    category: 'databases',
    tags: ['mongodb', 'nosql', 'database'],
    command: 'npx @modelcontextprotocol/server-mongodb',
    type: 'stdio',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Manage Notion pages, databases, and blocks',
    icon: 'simple-icons:notion',
    category: 'apis',
    tags: ['notion', 'docs', 'wiki'],
    command: 'npx @modelcontextprotocol/server-notion',
    type: 'stdio',
    featured: true,
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Access and manage Google Drive files',
    icon: 'simple-icons:googledrive',
    category: 'apis',
    tags: ['google', 'drive', 'files'],
    command: 'npx @modelcontextprotocol/server-google-drive',
    type: 'stdio',
  },
  {
    id: 'docker',
    name: 'Docker',
    description: 'Manage containers, images, and volumes',
    icon: 'simple-icons:docker',
    category: 'dev',
    tags: ['docker', 'containers', 'devops'],
    command: 'npx @modelcontextprotocol/server-docker',
    type: 'stdio',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Error tracking and performance monitoring',
    icon: 'simple-icons:sentry',
    category: 'apis',
    tags: ['sentry', 'errors', 'monitoring'],
    command: 'npx @modelcontextprotocol/server-sentry',
    type: 'stdio',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Postgres database with real-time and auth',
    icon: 'simple-icons:supabase',
    category: 'databases',
    tags: ['supabase', 'postgres', 'realtime'],
    command: 'npx @modelcontextprotocol/server-supabase',
    type: 'stdio',
    featured: true,
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Manage deployments, domains, and projects',
    icon: 'simple-icons:vercel',
    category: 'dev',
    tags: ['vercel', 'deploy', 'hosting'],
    command: 'npx @modelcontextprotocol/server-vercel',
    type: 'stdio',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Workers, KV, R2, and DNS management',
    icon: 'simple-icons:cloudflare',
    category: 'apis',
    tags: ['cloudflare', 'workers', 'cdn'],
    command: 'npx @modelcontextprotocol/server-cloudflare',
    type: 'stdio',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payments, subscriptions, and billing',
    icon: 'simple-icons:stripe',
    category: 'apis',
    tags: ['stripe', 'payments', 'billing'],
    command: 'npx @modelcontextprotocol/server-stripe',
    type: 'stdio',
  },
  {
    id: 'custom',
    name: 'Custom Server',
    description: 'Add your own MCP server with a custom command or URL',
    icon: 'lucide:plus-circle',
    category: 'custom',
    tags: ['custom'],
    command: '',
    type: 'stdio',
  },
]

const CATEGORIES = [
  { id: 'all', label: 'All', icon: 'lucide:layout-grid' },
  { id: 'installed', label: 'Installed', icon: 'lucide:check-circle' },
  { id: 'featured', label: 'Featured', icon: 'lucide:star' },
  { id: 'databases', label: 'Databases', icon: 'lucide:database' },
  { id: 'apis', label: 'APIs', icon: 'lucide:globe' },
  { id: 'dev', label: 'Developer', icon: 'lucide:code' },
  { id: 'custom', label: 'Custom', icon: 'lucide:plus-circle' },
]

// ─── Components ────────────────────────────────────────────────────────────

interface ServerCardProps {
  entry: McpCatalogEntry
  installed: boolean
  enabled: boolean
  onInstall: () => void
  onConfigure: () => void
}

function ServerCard({ entry, installed, enabled, onInstall, onConfigure }: ServerCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.15 }}
      className="group relative flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 transition-all duration-150 hover:border-[var(--border-hover)] hover:shadow-lg"
    >
      {/* Icon + Name */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--brand)]">
          <Icon icon={entry.icon} className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">{entry.name}</h3>
        </div>
      </div>

      {/* Description */}
      <p className="mb-4 line-clamp-2 flex-1 text-xs text-[var(--text-muted)]">{entry.description}</p>

      {/* Tags */}
      <div className="mb-3 flex flex-wrap gap-1">
        {entry.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Status + Action */}
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
        <div className="flex items-center gap-1.5 text-xs">
          {installed ? (
            <>
              <div
                className={`h-2 w-2 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-400'}`}
              />
              <span className="font-medium text-[var(--text-secondary)]">
                {enabled ? 'Active' : 'Inactive'}
              </span>
            </>
          ) : (
            <>
              <div className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="font-medium text-[var(--text-muted)]">Available</span>
            </>
          )}
        </div>

        <button
          onClick={installed ? onConfigure : onInstall}
          className="rounded-[var(--radius-md)] bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[var(--brand-hover)] hover:shadow-md active:scale-95"
        >
          {installed ? 'Configure' : 'Install'}
        </button>
      </div>
    </motion.div>
  )
}

interface ConfigModalProps {
  open: boolean
  onClose: () => void
  entry: McpCatalogEntry | null
  existingConfig?: McpServerConfig
  onSave: (config: McpServerConfig) => void
  onRemove?: () => void
}

function ConfigModal({ open, onClose, entry, existingConfig, onSave, onRemove }: ConfigModalProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<McpServerType>('stdio')
  const [command, setCommand] = useState('')
  const [url, setUrl] = useState('')
  const [args, setArgs] = useState('')
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([])
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (entry) {
      setName(existingConfig?.name ?? entry.name)
      setType(existingConfig?.type ?? entry.type)
      setCommand(existingConfig?.command ?? entry.command)
      setUrl(existingConfig?.url ?? '')
      setArgs(existingConfig?.args?.join(', ') ?? '')
      setEnvVars(
        existingConfig?.env
          ? Object.entries(existingConfig.env).map(([key, value]) => ({ key, value }))
          : [],
      )
      setEnabled(existingConfig?.enabled ?? true)
    }
  }, [entry, existingConfig])

  const handleSave = () => {
    if (!entry) return
    const config: McpServerConfig = {
      id: existingConfig?.id ?? entry.id,
      name,
      type,
      command: type === 'stdio' ? command : undefined,
      url: type === 'http' ? url : undefined,
      args: args
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      env: envVars.reduce(
        (acc, { key, value }) => {
          if (key) acc[key] = value
          return acc
        },
        {} as Record<string, string>,
      ),
      enabled,
    }
    onSave(config)
    onClose()
  }

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }])
  }

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index))
  }

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...envVars]
    updated[index][field] = value
    setEnvVars(updated)
  }

  if (!entry) return null

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--brand)]">
                  <Icon icon={entry.icon} className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    {existingConfig ? 'Configure' : 'Install'} {entry.name}
                  </h2>
                  <p className="text-sm text-[var(--text-muted)]">{entry.description}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
              >
                <Icon icon="lucide:x" className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4 overflow-y-auto max-h-[60vh]">
              {/* Name */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]"
                  placeholder="Server name"
                />
              </div>

              {/* Type */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                  Type
                </label>
                <div className="flex gap-2">
                  {(['stdio', 'http'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                        type === t
                          ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]'
                          : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]'
                      }`}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Command / URL */}
              {type === 'stdio' ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                    Command
                  </label>
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]"
                    placeholder="npx @modelcontextprotocol/server-..."
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                    URL
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]"
                    placeholder="https://your-mcp-server.com"
                  />
                </div>
              )}

              {/* Arguments */}
              {type === 'stdio' && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                    Arguments <span className="text-xs text-[var(--text-muted)]">(comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]"
                    placeholder="--arg1, --arg2=value"
                  />
                </div>
              )}

              {/* Environment Variables */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-sm font-medium text-[var(--text-primary)]">
                    Environment Variables
                  </label>
                  <button
                    onClick={addEnvVar}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--brand)] transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <Icon icon="lucide:plus" className="h-3 w-3" />
                    Add
                  </button>
                </div>
                {envVars.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No environment variables</p>
                ) : (
                  <div className="space-y-2">
                    {envVars.map((env, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={env.key}
                          onChange={(e) => updateEnvVar(i, 'key', e.target.value)}
                          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]"
                          placeholder="KEY"
                        />
                        <input
                          type="text"
                          value={env.value}
                          onChange={(e) => updateEnvVar(i, 'value', e.target.value)}
                          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]"
                          placeholder="value"
                        />
                        <button
                          onClick={() => removeEnvVar(i)}
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
                        >
                          <Icon icon="lucide:trash-2" className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Enabled Toggle */}
              <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Enabled</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Activate this server on startup
                  </p>
                </div>
                <button
                  onClick={() => setEnabled(!enabled)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    enabled ? 'bg-[var(--brand)]' : 'bg-gray-600'
                  }`}
                >
                  <motion.div
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white"
                    style={{ left: enabled ? '22px' : '2px' }}
                  />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex items-center justify-between gap-3">
              {existingConfig && onRemove ? (
                <button
                  onClick={onRemove}
                  className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
                >
                  <Icon icon="lucide:trash-2" className="h-4 w-4" />
                  Remove
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[var(--brand-hover)] hover:shadow-md active:scale-95"
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export function McpLibrary() {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<McpCatalogEntry | null>(null)
  const [existingConfig, setExistingConfig] = useState<McpServerConfig | undefined>()

  useEffect(() => {
    setServers(getMcpServers())
  }, [])

  const installedIds = useMemo(() => new Set(servers.map((s) => s.id)), [servers])

  const filteredCatalog = useMemo(() => {
    let filtered = MCP_CATALOG

    // Category filter
    if (category === 'installed') {
      filtered = filtered.filter((entry) => installedIds.has(entry.id))
    } else if (category === 'featured') {
      filtered = filtered.filter((entry) => entry.featured)
    } else if (category !== 'all') {
      filtered = filtered.filter((entry) => entry.category === category)
    }

    // Search filter
    if (search.trim()) {
      const query = search.toLowerCase()
      filtered = filtered.filter(
        (entry) =>
          entry.name.toLowerCase().includes(query) ||
          entry.description.toLowerCase().includes(query) ||
          entry.tags.some((tag) => tag.includes(query)),
      )
    }

    return filtered
  }, [category, search, installedIds])

  const handleInstall = (entry: McpCatalogEntry) => {
    setSelectedEntry(entry)
    setExistingConfig(undefined)
    setModalOpen(true)
  }

  const handleConfigure = (entry: McpCatalogEntry) => {
    const config = servers.find((s) => s.id === entry.id)
    setSelectedEntry(entry)
    setExistingConfig(config)
    setModalOpen(true)
  }

  const handleSave = (config: McpServerConfig) => {
    if (existingConfig) {
      setServers(updateMcpServer(config.id, config))
    } else {
      setServers(addMcpServer(config))
    }
  }

  const handleRemove = () => {
    if (selectedEntry) {
      setServers(removeMcpServer(selectedEntry.id))
      setModalOpen(false)
    }
  }

  const showEmptyState = category === 'installed' && filteredCatalog.length === 0

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--bg)]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[var(--border)] bg-[var(--bg)] px-6 py-5">
        <div className="mx-auto max-w-7xl">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
              <Icon icon="lucide:plug" className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">MCP Library</h1>
              <p className="text-sm text-[var(--text-muted)]">
                Connect tools and services to your AI agent
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex-shrink-0 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4">
        <div className="mx-auto max-w-7xl space-y-4">
          {/* Search */}
          <div className="relative">
            <Icon
              icon="lucide:search"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search servers..."
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
            />
          </div>

          {/* Categories */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                  category === cat.id
                    ? 'border-[var(--brand)] bg-[var(--brand)] text-white shadow-lg'
                    : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)]'
                }`}
              >
                <Icon icon={cat.icon} className="h-4 w-4" />
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-7xl">
          {showEmptyState ? (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--bg-subtle)]">
                <Icon icon="lucide:inbox" className="h-10 w-10 text-[var(--text-muted)]" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
                No MCP servers installed yet
              </h3>
              <p className="mb-6 text-sm text-[var(--text-muted)]">
                Browse the catalog to connect your first tool
              </p>
              <button
                onClick={() => setCategory('all')}
                className="rounded-lg bg-[var(--brand)] px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-[var(--brand-hover)] hover:shadow-md active:scale-95"
              >
                Browse Catalog
              </button>
            </div>
          ) : (
            <motion.div
              layout
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              <AnimatePresence mode="popLayout">
                {filteredCatalog.map((entry) => {
                  const installed = installedIds.has(entry.id)
                  const config = servers.find((s) => s.id === entry.id)
                  return (
                    <ServerCard
                      key={entry.id}
                      entry={entry}
                      installed={installed}
                      enabled={config?.enabled ?? false}
                      onInstall={() => handleInstall(entry)}
                      onConfigure={() => handleConfigure(entry)}
                    />
                  )
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>

      {/* Config Modal */}
      <ConfigModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        entry={selectedEntry}
        existingConfig={existingConfig}
        onSave={handleSave}
        onRemove={existingConfig ? handleRemove : undefined}
      />
    </div>
  )
}
