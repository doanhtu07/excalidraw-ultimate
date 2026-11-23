import { readAgentTextFile, writeAgentFile } from './files/agent-client'
import { layoutPath } from './workspace-layout'
import { parseWorkspaceLayout } from './workspace-layout-parse'
import type { WorkspaceLayout } from './workspace-layout'

export async function readWorkspaceLayout(
  stateDir: string,
): Promise<WorkspaceLayout | null> {
  let text: string

  try {
    text = await readAgentTextFile(layoutPath(stateDir))
  } catch {
    // First run (or a workspace without state yet): nothing to restore.
    return null
  }

  const layout = parseWorkspaceLayout(text)

  if (!layout) {
    console.warn('[excalidraw] workspace.json is not valid; starting empty.')
  }

  return layout
}

export async function writeWorkspaceLayout(
  stateDir: string,
  layout: WorkspaceLayout,
): Promise<void> {
  await writeAgentFile(
    layoutPath(stateDir),
    `${JSON.stringify(layout, null, 2)}\n`,
  )
}
