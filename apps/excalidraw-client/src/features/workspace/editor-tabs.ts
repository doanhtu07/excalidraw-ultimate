// MARK: Tab model

export interface EditorTab {
  id: string
  name: string
  /** True when the scene changed since it was last saved. */
  dirty: boolean
  /**
   * Name of the file on disk this tab is linked to (set when the drawing is
   * opened or saved for the first time). `null` for tabs that are not linked
   * to a file yet.
   */
  fileName: string | null
  /**
   * Absolute path of the drawing, when it was opened through the dev-only
   * agent bridge (`?agentFile=`). Browsers do not expose paths for drawings
   * opened through the File System Access API, so this is `null` for those.
   */
  filePath: string | null
  /**
   * Bumped whenever the scene is replaced because the linked file changed on
   * disk, so the canvas remounts with the new scene.
   */
  revision: number
}

// MARK: Identity

export function createTabId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }

  return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// MARK: Naming

const UNTITLED_NAME_PATTERN = /^Untitled-(\d+)$/
const UNTITLED_NAME_PREFIX = 'Untitled'

/** Follows the `Untitled-1`, `Untitled-2`, … naming scheme of VS Code. */
export function createUntitledName(tabs: ReadonlyArray<EditorTab>): string {
  const highestNumber = tabs.reduce((max, tab) => {
    const match = UNTITLED_NAME_PATTERN.exec(tab.name)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  return `${UNTITLED_NAME_PREFIX}-${highestNumber + 1}`
}

// MARK: Ordering

export type TabDropPosition = 'before' | 'after'

/**
 * Moves a tab next to another one. Returns the same array when the drop would
 * not change the order (dropped on itself, or on either side of its current
 * position) so callers can skip a re-render.
 */
export function reorderTabs(
  tabs: Array<EditorTab>,
  tabId: string,
  targetTabId: string,
  position: TabDropPosition,
): Array<EditorTab> {
  const fromIndex = tabs.findIndex((tab) => tab.id === tabId)
  if (fromIndex === -1 || tabId === targetTabId) return tabs

  const draggedTab = tabs[fromIndex]
  const remaining = tabs.filter((tab) => tab.id !== tabId)
  const targetIndex = remaining.findIndex((tab) => tab.id === targetTabId)
  if (targetIndex === -1) return tabs

  const insertAt = position === 'before' ? targetIndex : targetIndex + 1
  if (insertAt === fromIndex) return tabs

  return [
    ...remaining.slice(0, insertAt),
    draggedTab,
    ...remaining.slice(insertAt),
  ]
}
