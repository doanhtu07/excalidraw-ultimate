import { useEffect } from 'react'
import type { EditorTab } from '@/features/workspace/editor-tabs'

const APP_TITLE = 'Excalidraw Client'

export interface DocumentTitleProps {
  activeTab: EditorTab | null
}

/**
 * Keeps the browser tab title in sync with the active tab and its dirty flag.
 */
export function useDocumentTitle({ activeTab }: DocumentTitleProps): void {
  useEffect(() => {
    document.title = activeTab
      ? `${activeTab.dirty ? '● ' : ''}${activeTab.name} · ${APP_TITLE}`
      : APP_TITLE
  }, [activeTab])
}
