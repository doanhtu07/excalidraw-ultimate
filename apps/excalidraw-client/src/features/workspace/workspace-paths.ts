export const WORKSPACE_PARAM = 'workspace'
export const WORKSPACE_STATE_DIR = '.excalidraw-ultimate'
export const WORKSPACE_RECOVERY_DIR = 'recovery'
export const WORKSPACE_LAYOUT_FILE = 'workspace.json'

const LAST_WORKSPACE_KEY = 'excalidraw-ultimate:last-workspace'

/** Joins path segments without pulling Node's `path` into the browser bundle. */
export function joinPath(base: string, ...parts: Array<string>): string {
  const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/'

  return [base.replace(/[\\/]+$/, ''), ...parts].join(separator)
}

export function isAbsolutePath(value: string): boolean {
  return /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(value.trim())
}

export function workspaceRootFromLocation(): string | null {
  const value = new URLSearchParams(window.location.search).get(WORKSPACE_PARAM)

  return value?.trim() || null
}

export function storedWorkspaceRoot(): string | null {
  try {
    return localStorage.getItem(LAST_WORKSPACE_KEY)
  } catch {
    return null
  }
}

export function rememberWorkspaceRoot(root: string): void {
  try {
    localStorage.setItem(LAST_WORKSPACE_KEY, root)
  } catch {
    // Private mode or a full quota: remembering is a convenience only.
  }
}

export function workspaceUrl(root: string): string {
  const url = new URL(window.location.href)

  url.searchParams.set(WORKSPACE_PARAM, root)
  url.searchParams.delete('agentFile')

  return url.toString()
}

export function workspaceWindowName(root: string): string {
  return `excalidraw-ultimate:${root}`
}

export function workspaceLabel(root: string): string {
  return root.split(/[\\/]/).filter(Boolean).pop() || root
}

/** Stable hue so parallel workspace windows are easy to tell apart. */
export function workspaceHue(root: string): number {
  let hash = 0

  for (let index = 0; index < root.length; index += 1) {
    hash = (hash * 31 + root.charCodeAt(index)) | 0
  }

  return Math.abs(hash) % 360
}
