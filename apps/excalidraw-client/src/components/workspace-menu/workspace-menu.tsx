import { useEffect, useRef, useState } from 'react'
import styles from './workspace-menu.module.css'
import type { AgentWorkspace } from '@/features/workspace/files/workspace-registry'
import { CopyPathButton } from '@/components/copy-path-button/copy-path-button'
import { CheckSvg } from '@/components/svgs/check-svg'
import {
  workspaceHue,
  workspaceLabel,
} from '@/features/workspace/workspace-paths'

interface WorkspaceMenuProps {
  currentRoot: string
  workspaces: Array<AgentWorkspace>
  onSelect: (root: string) => void
  onAdd: () => void
  onRefresh: () => void
}

export function WorkspaceMenu({
  currentRoot,
  workspaces,
  onSelect,
  onAdd,
  onRefresh,
}: WorkspaceMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (!open) onRefresh()
    setOpen((prev) => !prev)
  }

  // MARK: Effects

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // MARK: Renderers

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={currentRoot}
      >
        <span
          className={styles.dot}
          style={{
            backgroundColor: `hsl(${workspaceHue(currentRoot)} 70% 45%)`,
          }}
        />

        <span className={styles.name}>{workspaceLabel(currentRoot)}</span>

        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          {workspaces.map((workspace) => {
            const isCurrent = workspace.root === currentRoot

            return (
              <div key={workspace.root} role="none" className={styles.itemRow}>
                <button
                  type="button"
                  role="menuitem"
                  aria-current={isCurrent ? 'true' : undefined}
                  className={styles.item}
                  onClick={() => {
                    setOpen(false)
                    onSelect(workspace.root)
                  }}
                >
                  <span
                    className={styles.itemDot}
                    style={{
                      backgroundColor: `hsl(${workspaceHue(workspace.root)} 70% 45%)`,
                    }}
                  />

                  <span className={styles.itemText}>
                    <span className={styles.itemName}>{workspace.name}</span>

                    <span className={styles.itemPath} title={workspace.root}>
                      {workspace.root}
                    </span>
                  </span>
                </button>

                <CopyPathButton path={workspace.root} className={styles.copy} />

                <span
                  className={styles.currentSlot}
                  title={isCurrent ? 'Current workspace' : undefined}
                >
                  {isCurrent && <CheckSvg />}
                </span>
              </div>
            )
          })}

          <div className={styles.separator} />

          <button
            type="button"
            role="menuitem"
            className={styles.add}
            onClick={() => {
              setOpen(false)
              onAdd()
            }}
          >
            Add workspace…
          </button>
        </div>
      )}
    </div>
  )
}
