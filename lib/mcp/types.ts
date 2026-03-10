/**
 * MCP (Model Context Protocol) Server Configuration Types
 */

export type McpServerType = 'stdio' | 'http'

export interface McpServerConfig {
  id: string
  name: string
  type: McpServerType
  command?: string // For stdio servers
  url?: string // For HTTP servers
  args?: string[] // Command arguments for stdio
  env?: Record<string, string> // Environment variables
  enabled: boolean
  status?: 'running' | 'stopped' | 'error' | 'unknown'
}
