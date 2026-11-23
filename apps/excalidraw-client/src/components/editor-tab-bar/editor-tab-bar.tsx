import { useState } from 'react'
import styles from './editor-tab-bar.module.css'
import { TAB_DRAG_TYPE, resolveDropTarget } from './drop-target'
import type { DragEvent } from 'react'
import type {
  EditorTab,
  TabDropPosition,
} from '@/features/workspace/editor-tabs'
import type { DropTarget } from './drop-target'
import { EditorTabAction } from '@/components/editor-tab-action/editor-tab-action'
import { CloseSvg } from '@/components/svgs/close-svg'
import { FolderSvg } from '@/components/svgs/folder-svg'
import { PlusSvg } from '@/components/svgs/plus-svg'
import { SaveSvg } from '@/components/svgs/save-svg'
import { cn } from '@/utils/tailwind-merge'

interface EditorTabBarProps {
  tabs: ReadonlyArray<EditorTab>
  activeTabId: string | null
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onMoveTab: (
    tabId: string,
    targetTabId: string,
    position: TabDropPosition,
  ) => void
  onNewDrawing: () => void
  onOpenDrawings: () => void
  onSave: () => void
}

export function EditorTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onMoveTab,
  onNewDrawing,
  onOpenDrawings,
  onSave,
}: EditorTabBarProps) {
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const resetDrag = () => {
    setDraggingTabId(null)
    setDropTarget(null)
  }

  const handleDragStart = (event: DragEvent<HTMLDivElement>, tabId: string) => {
    event.dataTransfer.effectAllowed = 'move'
    // Firefox only starts a drag when some data is set.
    event.dataTransfer.setData(TAB_DRAG_TYPE, tabId)
    event.dataTransfer.setData('text/plain', tabId)
    setDraggingTabId(tabId)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!draggingTabId) return

    const target = resolveDropTarget(event, tabs, draggingTabId)

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    setDropTarget((prev) =>
      prev?.tabId === target?.tabId && prev?.position === target?.position
        ? prev
        : target,
    )
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()

    const tabId =
      draggingTabId || event.dataTransfer.getData(TAB_DRAG_TYPE) || null

    const target = tabId ? resolveDropTarget(event, tabs, tabId) : null

    if (tabId && target) {
      onMoveTab(tabId, target.tabId, target.position)
    }

    resetDrag()
  }

  // MARK: Renderers

  return (
    <div className={styles.root}>
      <div
        className={styles.tabs}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragLeave={(event) => {
          // Ignore moves between children of the strip.
          if (
            event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            return
          }

          setDropTarget(null)
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const isDropTarget = dropTarget?.tabId === tab.id

          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              draggable
              aria-current={isActive ? 'page' : undefined}
              onDragStart={(event) => handleDragStart(event, tab.id)}
              onDragEnd={resetDrag}
              className={cn(
                styles.tab,
                isActive && styles.active,
                draggingTabId === tab.id && styles.dragging,
                isDropTarget &&
                  (dropTarget.position === 'before'
                    ? styles.dropBefore
                    : styles.dropAfter),
              )}
            >
              <button
                type="button"
                onClick={() => onSelectTab(tab.id)}
                title={tab.name}
                className={styles.tabButton}
              >
                <span className={styles.tabName}>{tab.name}</span>

                {tab.dirty && (
                  <span aria-label="Unsaved changes" className={styles.dot} />
                )}
              </button>

              <button
                type="button"
                aria-label={`Close ${tab.name}`}
                onClick={() => onCloseTab(tab.id)}
                className={styles.close}
              >
                <CloseSvg />
              </button>
            </div>
          )
        })}
      </div>

      <div className={styles.actions}>
        <EditorTabAction label="New drawing" onClick={onNewDrawing}>
          <PlusSvg />
        </EditorTabAction>

        <EditorTabAction label="Open file" onClick={onOpenDrawings}>
          <FolderSvg />
        </EditorTabAction>

        <EditorTabAction
          label="Save (Cmd/Ctrl+S)"
          onClick={onSave}
          disabled={tabs.length === 0}
        >
          <SaveSvg />
        </EditorTabAction>
      </div>
    </div>
  )
}
