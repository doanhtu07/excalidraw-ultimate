import { WORKSPACE_LAYOUT_FILE, joinPath } from './workspace-paths'
import type { FileStat } from './files/scene'

export interface PersistedTab {
  id: string
  name: string
  fileName: string | null
  filePath: string | null
  revision: number
  savedVersion: number
  stat: FileStat | null
  /** Path relative to the workspace state dir, e.g. `recovery/plan--ab12.excalidraw`. */
  recovery: string | null
}

export interface WorkspaceLayout {
  version: 1
  root: string
  name: string
  activeTabId: string | null
  updatedAt: string
  tabs: Array<PersistedTab>
}

export function layoutPath(stateDir: string): string {
  return joinPath(stateDir, WORKSPACE_LAYOUT_FILE)
}

export function recoveryPath(stateDir: string, recovery: string): string {
  return joinPath(stateDir, recovery)
}
