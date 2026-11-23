import styles from './empty-workspace.module.css'

interface EmptyWorkspaceProps {
  onNewDrawing: () => void
  onOpenDrawings: () => void
}

export function EmptyWorkspace({
  onNewDrawing,
  onOpenDrawings,
}: EmptyWorkspaceProps) {
  return (
    <div className={styles.root}>
      <div className={styles.panel}>
        <div>
          <h2 className={styles.title}>No drawing open</h2>

          <p className={styles.subtitle}>
            Create a new drawing or open an .excalidraw file to get started.
          </p>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            onClick={onNewDrawing}
            className={styles.primaryButton}
          >
            New drawing
          </button>

          <button
            type="button"
            onClick={onOpenDrawings}
            className={styles.secondaryButton}
          >
            Open file…
          </button>
        </div>
      </div>
    </div>
  )
}
