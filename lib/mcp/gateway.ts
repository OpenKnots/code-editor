import type { McpServerConfig } from './types'
import {
  getMcpServers,
  addMcpServer as addMcpServerLocal,
  removeMcpServer as removeMcpServerLocal,
  toggleMcpServer as toggleMcpServerLocal,
} from './storage'

type SendRequest = (method: string, params?: Record<string, unknown>) => Promise<unknown>

let _sendRequest: SendRequest | null = null

/** Initialize the MCP gateway client with a sendRequest function from gateway context */
export function initMcpGateway(sendRequest: SendRequest) {
  _sendRequest = sendRequest
}

/** List MCP servers — returns local + gateway status */
export async function listMcpServers(): Promise<McpServerConfig[]> {
  const local = getMcpServers()
  if (!_sendRequest) return local

  try {
    const resp = await _sendRequest('mcp.list') as { servers?: Array<{ id: string; status: string }> } | undefined
    if (resp?.servers) {
      return local.map(s => ({
        ...s,
        status: resp.servers?.find(gs => gs.id === s.id)?.status as 'running' | 'stopped' | 'error' | 'unknown' | undefined
      }))
    }
  } catch (e) {
    console.warn('[MCP Gateway] Failed to fetch server status:', e)
  }
  return local
}

/** Add MCP server locally and sync to gateway */
export async function addMcpServer(config: McpServerConfig): Promise<McpServerConfig[]> {
  const servers = addMcpServerLocal(config)
  if (_sendRequest) {
    try {
      await _sendRequest('mcp.add', {
        id: config.id,
        name: config.name,
        type: config.type,
        command: config.command,
        url: config.url,
        args: config.args,
        env: config.env,
      })
    } catch (e) {
      console.warn('[MCP Gateway] Failed to add server:', e)
    }
  }
  return servers
}

/** Remove MCP server locally and from gateway */
export async function removeMcpServer(id: string): Promise<McpServerConfig[]> {
  const servers = removeMcpServerLocal(id)
  if (_sendRequest) {
    try { await _sendRequest('mcp.remove', { id }) } catch {}
  }
  return servers
}

/** Toggle MCP server enabled state locally and on gateway */
export async function toggleMcpServer(id: string): Promise<McpServerConfig[]> {
  const servers = toggleMcpServerLocal(id)
  const server = servers.find(s => s.id === id)
  if (_sendRequest && server) {
    try {
      await _sendRequest(server.enabled ? 'mcp.start' : 'mcp.stop', { id })
    } catch {}
  }
  return servers
}

/** Sync all local MCP configs to gateway */
export async function syncMcpServers(): Promise<void> {
  if (!_sendRequest) return
  const servers = getMcpServers()
  try {
    await _sendRequest('mcp.sync', { servers: servers.filter(s => s.enabled) })
  } catch (e) {
    console.warn('[MCP Gateway] Sync failed:', e)
  }
}
