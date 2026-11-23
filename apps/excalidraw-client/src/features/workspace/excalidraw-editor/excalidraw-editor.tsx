import styles from './excalidraw-editor.module.css'
import { useDocumentTitle } from './hooks/use-document-title'
import { useExcalidrawTabs } from './hooks/use-excalidraw-tabs'
import { useFileDrop } from './hooks/use-file-drop'
import { useIsClient } from './hooks/use-is-client'
import { useSaveShortcut } from './hooks/use-save-shortcut'
import { useUnsavedChangesGuard } from './hooks/use-unsaved-changes-guard'
import { ExcalidrawTab } from '@/features/workspace/excalidraw-tab/excalidraw-tab'
import { EmptyWorkspace } from '@/components/empty-workspace/empty-workspace'
import { EditorTabBar } from '@/components/editor-tab-bar/editor-tab-bar'

export function ExcalidrawEditor() {
  const isClient = useIsClient()

  const {
    tabs,
    activeTab,
    activeTabId,
    hasUnsavedTabs,
    scenesRef,
    setActiveTabId,
    syncScene,
    newDrawing,
    openDrawingFile,
    openDrawings,
    saveActiveDrawing,
    closeTab,
    moveTab,
  } = useExcalidrawTabs()

  const { isDraggingFiles, handleDragOver, handleDragLeave, handleDrop } =
    useFileDrop({ onDropFile: openDrawingFile })

  useDocumentTitle({ activeTab })
  useUnsavedChangesGuard({ hasUnsavedTabs })
  useSaveShortcut({ saveActiveDrawing })

  // MARK: Renderers

  if (!isClient) {
    return (
      <div className={styles.fallback}>
        <p className={styles.fallbackText}>Loading canvas…</p>
      </div>
    )
  }

  return (
    <div
      className={styles.root}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <EditorTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={closeTab}
        onMoveTab={moveTab}
        onNewDrawing={newDrawing}
        onOpenDrawings={openDrawings}
        onSave={saveActiveDrawing}
      />

      <div className={styles.canvasArea}>
        {/* Only the active tab is mounted; the `key` remounts the canvas with
            the stored scene when switching tabs. */}
        {activeTab ? (
          <ExcalidrawTab
            key={`${activeTab.id}:${activeTab.revision}`}
            tabId={activeTab.id}
            scenesRef={scenesRef}
            syncScene={syncScene}
          />
        ) : (
          <EmptyWorkspace
            onNewDrawing={newDrawing}
            onOpenDrawings={openDrawings}
          />
        )}

        {isDraggingFiles && (
          <div className={styles.dragOverlay}>
            <p className={styles.dragOverlayText}>Drop to open drawing(s)</p>
          </div>
        )}
      </div>
    </div>
  )
}
