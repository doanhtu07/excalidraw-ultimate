import { useEffect } from 'react'
import type { EditorTab } from '@/features/workspace/editor-tabs'

const APP_TITLE = 'Excalidraw Client'

export interface DocumentTitleProps {
  activeTab: EditorTab | null
  workspaceName: string
}

/**
 * Keeps the browser tab title in sync with the workspace and active tab, so
 * parallel workspace windows are easy to tell apart.
 */
export function useDocumentTitle({
  activeTab,
  workspaceName,
}: DocumentTitleProps): void {
  useEffect(() => {
    const prefix = activeTab
      ? `${activeTab.dirty ? '● ' : ''}${activeTab.name} · `
      : ''

    document.title = `${prefix}${workspaceName} · ${APP_TITLE}`
  }, [activeTab, workspaceName])
}
