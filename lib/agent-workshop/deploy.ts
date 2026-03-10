export interface DeployedAgent {
  name: string
  systemPrompt: string
  deployedAt: number
  blueprintId?: string
}

const DEPLOYED_AGENT_KEY = 'knot-code:workshop:deployed-agent'

export function deployAgent(agent: DeployedAgent): void {
  localStorage.setItem(DEPLOYED_AGENT_KEY, JSON.stringify(agent))
}

export function getDeployedAgent(): DeployedAgent | null {
  try {
    const raw = localStorage.getItem(DEPLOYED_AGENT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearDeployedAgent(): void {
  localStorage.removeItem(DEPLOYED_AGENT_KEY)
}
