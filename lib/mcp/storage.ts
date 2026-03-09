/**
 * MCP Server Configuration Storage (localStorage)
 */

import type { McpServerConfig } from './types'

const MCP_STORAGE_KEY = 'knot-code:mcp:servers'

/**
 * Get all MCP server configurations from localStorage
 */
export function getMcpServers(): McpServerConfig[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(MCP_STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data) as McpServerConfig[]
  } catch (err) {
    console.error('Failed to load MCP servers from localStorage:', err)
    return []
  }
}

/**
 * Save all MCP server configurations to localStorage
 */
export function saveMcpServers(servers: McpServerConfig[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(servers))
  } catch (err) {
    console.error('Failed to save MCP servers to localStorage:', err)
  }
}

/**
 * Add a new MCP server configuration
 */
export function addMcpServer(config: McpServerConfig): McpServerConfig[] {
  const servers = getMcpServers()
  servers.push(config)
  saveMcpServers(servers)
  return servers
}

/**
 * Remove an MCP server by ID
 */
export function removeMcpServer(id: string): McpServerConfig[] {
  const servers = getMcpServers()
  const filtered = servers.filter((s) => s.id !== id)
  saveMcpServers(filtered)
  return filtered
}

/**
 * Update an MCP server configuration
 */
export function updateMcpServer(id: string, updates: Partial<McpServerConfig>): McpServerConfig[] {
  const servers = getMcpServers()
  const updated = servers.map((s) => (s.id === id ? { ...s, ...updates } : s))
  saveMcpServers(updated)
  return updated
}

/**
 * Toggle the enabled state of an MCP server
 */
export function toggleMcpServer(id: string): McpServerConfig[] {
  const servers = getMcpServers()
  const updated = servers.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
  saveMcpServers(updated)
  return updated
}
