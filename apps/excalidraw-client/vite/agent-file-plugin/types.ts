export interface FileStat {
  lastModified: number
  size: number
}

export interface WorkspaceEntry {
  root: string
  name: string
  updatedAt: string
}

export interface ReadFilePayload {
  path: string
  name: string
  text: string
  stat: FileStat
}

export interface StatFilePayload {
  path: string
  name: string
  stat: FileStat
}

export interface WriteFilePayload {
  path: string
  bytes: number
  stat: FileStat
}

export interface WorkspacesPayload {
  workspaces: Array<WorkspaceEntry>
}

export interface WorkspacePayload {
  workspace: WorkspaceEntry
}

export interface InitializedWorkspacePayload {
  workspace: WorkspaceEntry
  stateDir: string
  recoveryDir: string
}
