import { agentUrl, readAgentError } from './agent-client'

export interface AgentWorkspace {
  root: string
  name: string
  updatedAt: string
}

export interface InitializedWorkspace {
  workspace: AgentWorkspace
  stateDir: string
  recoveryDir: string
}

interface WorkspacesPayload {
  workspaces: Array<AgentWorkspace>
}

interface WorkspacePayload {
  workspace: AgentWorkspace
}

/** Creates `.excalidraw-ultimate/` inside a project and registers it. */
export async function initAgentWorkspace(
  root: string,
  name?: string,
): Promise<InitializedWorkspace> {
  const response = await fetch(agentUrl('/workspace/init'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, name }),
  })

  if (!response.ok) {
    throw await readAgentError(response, `Could not initialize ${root}.`)
  }

  return (await response.json()) as InitializedWorkspace
}

export async function registerAgentWorkspace(
  root: string,
  name?: string,
): Promise<AgentWorkspace> {
  const response = await fetch(agentUrl('/workspaces'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, name }),
  })

  if (!response.ok) {
    throw await readAgentError(response, `Could not register ${root}.`)
  }

  return ((await response.json()) as WorkspacePayload).workspace
}

export async function listAgentWorkspaces(): Promise<Array<AgentWorkspace>> {
  const response = await fetch(agentUrl('/workspaces'))

  if (!response.ok) {
    throw await readAgentError(response, 'Could not list workspaces.')
  }

  return ((await response.json()) as WorkspacesPayload).workspaces
}

/** Removes a workspace from the switcher registry, not from disk. */
export async function removeAgentWorkspace(root: string): Promise<void> {
  const response = await fetch(agentUrl('/workspaces', { root }), {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw await readAgentError(response, `Could not remove ${root}.`)
  }
}
