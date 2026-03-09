/**
 * MCP Gateway Integration
 *
 * This module provides stub functions for MCP server management via the gateway.
 * Currently, these functions operate on localStorage only.
 * In the future, they will communicate with the gateway via RPC to manage MCP servers.
 */

import type { McpServerConfig } from './types'
import {
  getMcpServers,
  addMcpServer as addMcpServerLocal,
  removeMcpServer as removeMcpServerLocal,
  toggleMcpServer as toggleMcpServerLocal,
} from './storage'

/**
 * List all MCP server configurations
 * TODO: In the future, this will query the gateway via RPC
 */
export async function listMcpServers(): Promise<McpServerConfig[]> {
  return getMcpServers()
}

/**
 * Add a new MCP server
 * TODO: In the future, this will send the config to the gateway via RPC
 */
export async function addMcpServer(config: McpServerConfig): Promise<McpServerConfig[]> {
  const servers = addMcpServerLocal(config)
  // TODO: Send to gateway
  // await gateway.rpc('mcp.add', config)
  return servers
}

/**
 * Remove an MCP server
 * TODO: In the future, this will remove the server from the gateway via RPC
 */
export async function removeMcpServer(id: string): Promise<McpServerConfig[]> {
  const servers = removeMcpServerLocal(id)
  // TODO: Send to gateway
  // await gateway.rpc('mcp.remove', { id })
  return servers
}

/**
 * Toggle an MCP server enabled state
 * TODO: In the future, this will toggle the server on the gateway via RPC
 */
export async function toggleMcpServer(id: string): Promise<McpServerConfig[]> {
  const servers = toggleMcpServerLocal(id)
  // TODO: Send to gateway
  // await gateway.rpc('mcp.toggle', { id })
  return servers
}

/**
 * Sync all MCP server configurations to the gateway
 * TODO: Implement gateway sync via RPC
 */
export async function syncMcpServers(): Promise<void> {
  const servers = getMcpServers()
  console.log('[MCP Gateway] Sync to gateway (stub):', servers)
  // TODO: Implement gateway RPC call
  // await gateway.rpc('mcp.sync', { servers })

  // For now, just simulate a short delay
  await new Promise((resolve) => setTimeout(resolve, 300))
}
