'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import type { McpServerConfig, McpServerType } from '@/lib/mcp/types'
import {
  listMcpServers,
  addMcpServer,
  removeMcpServer,
  toggleMcpServer,
  syncMcpServers,
} from '@/lib/mcp/gateway'

/**
 * MCP Settings Component
 * Allows users to configure MCP (Model Context Protocol) servers
 */
export function McpSettings() {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [formData, setFormData] = useState<{
    name: string
    type: McpServerType
    command: string
    url: string
    args: string
    env: string
  }>({
    name: '',
    type: 'stdio',
    command: '',
    url: '',
    args: '',
    env: '',
  })

  // Load servers on mount
  useEffect(() => {
    listMcpServers().then(setServers)
  }, [])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await syncMcpServers()
      const updated = await listMcpServers()
      setServers(updated)
    } catch (err) {
      console.error('Failed to sync MCP servers:', err)
    } finally {
      setSyncing(false)
    }
  }, [])

  const handleToggle = useCallback(async (id: string) => {
    try {
      const updated = await toggleMcpServer(id)
      setServers(updated)
    } catch (err) {
      console.error('Failed to toggle MCP server:', err)
    }
  }, [])

  const handleRemove = useCallback(async (id: string) => {
    try {
      const updated = await removeMcpServer(id)
      setServers(updated)
    } catch (err) {
      console.error('Failed to remove MCP server:', err)
    }
  }, [])

  const handleAdd = useCallback(async () => {
    if (!formData.name.trim()) return

    try {
      const config: McpServerConfig = {
        id: `mcp-${Date.now()}`,
        name: formData.name.trim(),
        type: formData.type,
        enabled: true,
      }

      if (formData.type === 'stdio') {
        config.command = formData.command.trim()
        if (formData.args.trim()) {
          config.args = formData.args.split(',').map((a) => a.trim())
        }
      } else {
        config.url = formData.url.trim()
      }

      if (formData.env.trim()) {
        try {
          config.env = JSON.parse(formData.env)
        } catch {
          // Ignore invalid JSON
        }
      }

      const updated = await addMcpServer(config)
      setServers(updated)
      setFormData({
        name: '',
        type: 'stdio',
        command: '',
        url: '',
        args: '',
        env: '',
      })
      setShowAddForm(false)
    } catch (err) {
      console.error('Failed to add MCP server:', err)
    }
  }, [formData])

  return (
    <div className="space-y-5">
      {/* MCP Servers Section */}
      <section className="rounded-[24px] border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-4 shadow-[var(--shadow-sm)]">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]">
            <Icon icon="lucide:plug" width={14} />
          </span>
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">MCP Servers</h3>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Configure Model Context Protocol servers for enhanced AI capabilities.
            </p>
          </div>
        </div>

        {/* Server List */}
        {servers.length > 0 && (
          <div className="mb-4 space-y-2">
            {servers.map((server) => (
              <div
                key={server.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-3 py-2.5 transition hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]"
              >
                <button
                  onClick={() => handleToggle(server.id)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition cursor-pointer"
                  title={server.enabled ? 'Disable' : 'Enable'}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${server.enabled ? 'bg-emerald-400' : 'bg-[var(--text-disabled)]'}`}
                  />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-[var(--text-primary)]">
                      {server.name}
                    </p>
                    <span className="rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-disabled)]">
                      {server.type}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
                    {server.type === 'stdio' ? server.command : server.url}
                  </p>
                </div>

                <button
                  onClick={() => handleRemove(server.id)}
                  className="shrink-0 text-[var(--text-disabled)] transition hover:text-[var(--color-deletions)] cursor-pointer"
                  title="Remove server"
                >
                  <Icon icon="lucide:trash-2" width={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {servers.length === 0 && !showAddForm && (
          <div className="mb-4 rounded-xl border border-dashed border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 py-8 text-center">
            <Icon
              icon="lucide:plug"
              width={32}
              height={32}
              className="mx-auto mb-2 text-[var(--text-disabled)]"
            />
            <p className="text-[12px] text-[var(--text-secondary)]">No MCP servers configured</p>
            <p className="mt-1 text-[11px] text-[var(--text-disabled)]">
              Add a server to get started
            </p>
          </div>
        )}

        {/* Add Form */}
        {showAddForm && (
          <div className="mb-4 space-y-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] p-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
                Server Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My MCP Server"
                className="w-full rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none transition focus:border-[var(--brand)]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
                Server Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['stdio', 'http'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFormData({ ...formData, type })}
                    className={`rounded-lg border px-3 py-2 text-[12px] font-medium transition cursor-pointer ${
                      formData.type === type
                        ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--brand)]'
                        : 'border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]'
                    }`}
                  >
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {formData.type === 'stdio' ? (
              <>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
                    Command
                  </label>
                  <input
                    type="text"
                    value={formData.command}
                    onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                    placeholder="npx @modelcontextprotocol/server-example"
                    className="w-full rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] px-3 py-2 font-mono text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none transition focus:border-[var(--brand)]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
                    Arguments (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formData.args}
                    onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                    placeholder="--port, 3000"
                    className="w-full rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] px-3 py-2 font-mono text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none transition focus:border-[var(--brand)]"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
                  URL
                </label>
                <input
                  type="text"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="http://localhost:3000"
                  className="w-full rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] px-3 py-2 font-mono text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none transition focus:border-[var(--brand)]"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
                Environment Variables (JSON)
              </label>
              <textarea
                value={formData.env}
                onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                placeholder='{"API_KEY": "..."}'
                rows={2}
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] px-3 py-2 font-mono text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none transition focus:border-[var(--brand)]"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={!formData.name.trim()}
                className="flex-1 rounded-lg bg-[var(--brand)] px-3 py-2 text-[12px] font-medium text-[var(--brand-contrast,#fff)] transition hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add Server
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-3 py-2 text-[12px] font-medium text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-3 py-2 text-[12px] font-medium text-[var(--text-primary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] cursor-pointer"
            >
              <Icon icon="lucide:plus" width={14} />
              Add Server
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-3 py-2 text-[12px] font-medium text-[var(--text-primary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] cursor-pointer disabled:opacity-50"
          >
            <Icon
              icon={syncing ? 'lucide:loader-2' : 'lucide:refresh-cw'}
              width={14}
              className={syncing ? 'animate-spin' : ''}
            />
            {syncing ? 'Syncing...' : 'Sync to Gateway'}
          </button>
        </div>
      </section>
    </div>
  )
}
