import { useCallback, useRef, useState } from 'react'
import styles from './excalidraw-editor/excalidraw-editor.module.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { AgentWorkspace } from '@/features/workspace/files/workspace-registry'
import { FileHud } from '@/components/file-hud/file-hud'
import { PathDialog } from '@/components/path-dialog/path-dialog'
import { EditorTabBar } from '@/components/editor-tab-bar/editor-tab-bar'
import { WorkspaceMenu } from '@/components/workspace-menu/workspace-menu'
import { EmptyWorkspace } from '@/components/empty-workspace/empty-workspace'
import { useAgentBridge } from '@/features/workspace/agent/use-agent-bridge'
import { useDocumentTitle } from '@/features/workspace/excalidraw-editor/hooks/use-document-title'
import { useExcalidrawTabs } from '@/features/workspace/excalidraw-editor/hooks/use-excalidraw-tabs'
import { useFileDrop } from '@/features/workspace/excalidraw-editor/hooks/use-file-drop'
import { useSaveShortcut } from '@/features/workspace/excalidraw-editor/hooks/use-save-shortcut'
import { ExcalidrawTab } from '@/features/workspace/excalidraw-tab/excalidraw-tab'
import { DRAWING_FILE_EXTENSION } from '@/features/workspace/files/scene'
import { joinPath } from '@/features/workspace/workspace-paths'

type DialogState =
  | { mode: 'open'; initialPath?: string }
  | { mode: 'save'; initialPath: string }
  | null

interface WorkspaceEditorProps {
  workspaceRoot: string
  workspaceName: string
  workspaces: Array<AgentWorkspace>
  onSelectWorkspace: (root: string) => void
  onAddWorkspace: () => void
  onRefreshWorkspaces: () => void
  onRemoveWorkspace: (root: string) => Promise<void>
}

/** The editor for one workspace: tabs, canvas, persistence, and dialogs. */
export function WorkspaceEditor({
  workspaceRoot,
  workspaceName,
  workspaces,
  onSelectWorkspace,
  onAddWorkspace,
  onRefreshWorkspaces,
  onRemoveWorkspace,
}: WorkspaceEditorProps) {
  const {
    tabs,
    activeTab,
    activeTabId,
    hydrated,
    persistenceError,
    scenesRef,
    setActiveTabId,
    syncScene,
    newDrawing,
    openDrawingFromPath,
    openDroppedFile,
    saveActiveDrawing,
    saveActiveDrawingToPath,
    closeTab,
    moveTab,
  } = useExcalidrawTabs({ workspaceRoot })

  const { isDraggingFiles, handleDragOver, handleDragLeave, handleDrop } =
    useFileDrop({ onDropFile: openDroppedFile })

  const [dialog, setDialog] = useState<DialogState>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI | null) => {
    apiRef.current = api
  }, [])

  const saveThroughAgent = useCallback(async () => {
    const result = await saveActiveDrawing()

    if (result.needsPath) {
      throw new Error('Save this drawing through the UI first.')
    }

    if (result.error) throw new Error(result.error)
  }, [saveActiveDrawing])

  const saveFromUi = useCallback(async () => {
    const result = await saveActiveDrawing()

    if (result.needsPath && activeTab) {
      setDialog({
        mode: 'save',
        initialPath: joinPath(
          workspaceRoot,
          `${activeTab.name}${DRAWING_FILE_EXTENSION}`,
        ),
      })
      return
    }

    if (result.error) window.alert(result.error)
  }, [saveActiveDrawing, activeTab, workspaceRoot])

  // MARK: Effects

  useAgentBridge({
    enabled: hydrated,
    workspaceRoot,
    tabs,
    activeTabId,
    apiRef,
    openPath: openDrawingFromPath,
    saveActiveDrawing: saveThroughAgent,
  })

  useDocumentTitle({ activeTab, workspaceName })

  useSaveShortcut({ saveActiveDrawing: saveFromUi })

  // MARK: Renderers

  if (!hydrated) {
    return (
      <div className={styles.fallback}>
        <p className={styles.fallbackText}>Loading workspace…</p>
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
        Leading={
          <WorkspaceMenu
            currentRoot={workspaceRoot}
            workspaces={workspaces}
            onSelect={onSelectWorkspace}
            onAdd={onAddWorkspace}
            onRefresh={onRefreshWorkspaces}
            onRemove={onRemoveWorkspace}
          />
        }
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={closeTab}
        onMoveTab={moveTab}
        onNewDrawing={newDrawing}
        onOpenDrawings={() => setDialog({ mode: 'open' })}
        onSave={() => void saveFromUi()}
      />

      {persistenceError && (
        <p className={styles.persistenceWarning}>
          Workspace persistence is unavailable: {persistenceError}
        </p>
      )}

      {activeTab && <FileHud tab={activeTab} />}

      <div className={styles.canvasArea}>
        {activeTab ? (
          <ExcalidrawTab
            key={`${activeTab.id}:${activeTab.revision}`}
            tabId={activeTab.id}
            scenesRef={scenesRef}
            syncScene={syncScene}
            onApiReady={handleApiReady}
          />
        ) : (
          <EmptyWorkspace
            onNewDrawing={newDrawing}
            onOpenDrawings={() => setDialog({ mode: 'open' })}
          />
        )}

        {isDraggingFiles && (
          <div className={styles.dragOverlay}>
            <p className={styles.dragOverlayText}>Drop to open drawing(s)</p>
          </div>
        )}
      </div>

      {dialog?.mode === 'open' && (
        <PathDialog
          mode="open"
          initialPath={dialog.initialPath}
          recentsKey={`excalidraw-ultimate:recent:open:${workspaceRoot}`}
          onCancel={() => setDialog(null)}
          onConfirm={async (path) => {
            const tabId = await openDrawingFromPath(path)

            if (!tabId) throw new Error(`Could not open ${path}.`)
            setDialog(null)
          }}
        />
      )}

      {dialog?.mode === 'save' && (
        <PathDialog
          mode="save"
          initialPath={dialog.initialPath}
          recentsKey={`excalidraw-ultimate:recent:save:${workspaceRoot}`}
          onCancel={() => setDialog(null)}
          onConfirm={async (path) => {
            const result = await saveActiveDrawingToPath(path)

            if (!result.saved) {
              throw new Error(result.error ?? 'Could not save the drawing.')
            }

            setDialog(null)
          }}
        />
      )}
    </div>
  )
}
