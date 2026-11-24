import { useCallback, useEffect, useState } from 'react'
import type { AgentWorkspace } from '@/features/workspace/files/workspace-registry'
import {
  listAgentWorkspaces,
  registerAgentWorkspace,
  removeAgentWorkspace,
} from '@/features/workspace/files/workspace-registry'
import {
  sortWorkspacesByRoot,
  workspaceLabel,
} from '@/features/workspace/workspace-paths'

export interface WorkspacesState {
  workspaces: Array<AgentWorkspace>
  loading: boolean
  error: string | null
  refresh: () => void
  remove: (root: string) => Promise<void>
}

function withCurrent(
  workspaces: Array<AgentWorkspace>,
  currentRoot: string | null,
): Array<AgentWorkspace> {
  if (!currentRoot || workspaces.some((item) => item.root === currentRoot)) {
    return sortWorkspacesByRoot(workspaces)
  }

  return sortWorkspacesByRoot([
    {
      root: currentRoot,
      name: workspaceLabel(currentRoot),
      updatedAt: new Date().toISOString(),
    },
    ...workspaces,
  ])
}

/** Lists registered workspaces and keeps the current one in the list. */
export function useWorkspaces(currentRoot: string | null): WorkspacesState {
  const [workspaces, setWorkspaces] = useState<Array<AgentWorkspace>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const listed = await listAgentWorkspaces()
        setWorkspaces(withCurrent(listed, currentRoot))
        setError(null)
      } catch {
        setWorkspaces(withCurrent([], currentRoot))
        setError('Workspace list is unavailable. Is the dev server running?')
      } finally {
        setLoading(false)
      }
    })()
  }, [currentRoot])

  const remove = useCallback(async (root: string) => {
    await removeAgentWorkspace(root)

    setWorkspaces((current) =>
      current.filter((workspace) => workspace.root !== root),
    )
  }, [])

  // MARK: Effects

  useEffect(() => {
    if (!currentRoot) {
      refresh()
      return
    }

    // The hydration step also initializes the workspace; doing it here keeps
    // the current project visible in the switcher as soon as it opens.
    void registerAgentWorkspace(currentRoot)
      .then(() => refresh())
      .catch(() => refresh())
  }, [currentRoot, refresh])

  // MARK: Return value

  return { workspaces, loading, error, refresh, remove }
}
