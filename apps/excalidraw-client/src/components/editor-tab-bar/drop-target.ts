import type { DragEvent } from 'react'
import type {
  EditorTab,
  TabDropPosition,
} from '@/features/workspace/editor-tabs'

export interface DropTarget {
  tabId: string
  position: TabDropPosition
}

export const TAB_DRAG_TYPE = 'application/x-editor-tab'

/**
 * Where a pointer over the tab strip would drop a tab, or `null` when the drop
 * is a no-op (over the dragged tab itself).
 */
export function resolveDropTarget(
  event: DragEvent<HTMLDivElement>,
  tabs: ReadonlyArray<EditorTab>,
  draggingTabId: string,
): DropTarget | null {
  const hovered = (event.target as HTMLElement).closest<HTMLElement>(
    '[data-tab-id]',
  )

  const hoveredTabId = hovered?.dataset.tabId

  if (!hovered || !hoveredTabId) {
    // Empty space after the last tab: dropping appends to the end.
    const lastTab = tabs.at(-1)

    return lastTab && lastTab.id !== draggingTabId
      ? { tabId: lastTab.id, position: 'after' }
      : null
  }

  if (hoveredTabId === draggingTabId) return null

  const rect = hovered.getBoundingClientRect()

  const position: TabDropPosition =
    event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'

  return { tabId: hoveredTabId, position }
}
