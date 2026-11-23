import { useEffect, useState } from 'react'
import { PathDialog } from '@/components/path-dialog/path-dialog'
import { WorkspaceChooser } from '@/components/workspace-chooser/workspace-chooser'
import { initAgentWorkspace } from '@/features/workspace/files/workspace-registry'
import { useWorkspaces } from '@/features/workspace/hooks/use-workspaces'
import { WorkspaceEditor } from '@/features/workspace/workspace-editor'
import {
  listenForWorkspaceFocus,
  requestWorkspaceFocus,
} from '@/features/workspace/workspace-presence'
import {
  rememberWorkspaceRoot,
  storedWorkspaceRoot,
  workspaceLabel,
  workspaceRootFromLocation,
  workspaceUrl,
  workspaceWindowName,
} from '@/features/workspace/workspace-paths'

/**
 * Chooses the workspace for this window, then mounts the editor for it.
 *
 * Selecting another workspace opens (or focuses) its own window so tabs and
 * unsaved scenes stay isolated per project.
 */
export function WorkspaceApp() {
  const [root, setRoot] = useState<string | null>(
    () => workspaceRootFromLocation() ?? storedWorkspaceRoot(),
  )
  const [adding, setAdding] = useState(false)
  const { workspaces, loading, error, refresh } = useWorkspaces(root)

  const openWorkspace = async (nextRoot: string) => {
    rememberWorkspaceRoot(nextRoot)

    if (!root) {
      window.history.replaceState(null, '', workspaceUrl(nextRoot))
      setRoot(nextRoot)
      return
    }

    if (nextRoot === root) return

    // Focus an existing window when one is open; otherwise open a new one.
    if (await requestWorkspaceFocus(nextRoot)) return

    window.open(workspaceUrl(nextRoot), workspaceWindowName(nextRoot))
  }

  const addWorkspace = async (path: string) => {
    await initAgentWorkspace(path)
    refresh()
    await openWorkspace(path)
  }

  // MARK: Effects

  // Keep the URL in sync so reloads and agent page matching use the same key.
  useEffect(() => {
    if (!root) return

    rememberWorkspaceRoot(root)

    if (workspaceRootFromLocation() !== root) {
      window.history.replaceState(null, '', workspaceUrl(root))
    }

    window.name = workspaceWindowName(root)
  }, [root])

  useEffect(() => {
    if (!root) return

    return listenForWorkspaceFocus(root)
  }, [root])

  // MARK: Renderers

  return (
    <>
      {root ? (
        <WorkspaceEditor
          key={root}
          workspaceRoot={root}
          workspaceName={workspaceLabel(root)}
          workspaces={workspaces}
          onSelectWorkspace={openWorkspace}
          onAddWorkspace={() => setAdding(true)}
          onRefreshWorkspaces={refresh}
        />
      ) : (
        <WorkspaceChooser
          workspaces={workspaces}
          loading={loading}
          error={error}
          onSelect={openWorkspace}
          onAdd={() => setAdding(true)}
        />
      )}

      {adding && (
        <PathDialog
          mode="workspace"
          recentsKey="excalidraw-ultimate:recent:workspace"
          onCancel={() => setAdding(false)}
          onConfirm={async (path) => {
            await addWorkspace(path)
            setAdding(false)
          }}
        />
      )}
    </>
  )
}
