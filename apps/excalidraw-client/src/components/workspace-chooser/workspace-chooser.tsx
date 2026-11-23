import styles from './workspace-chooser.module.css'
import type { AgentWorkspace } from '@/features/workspace/files/workspace-registry'
import { CopyPathButton } from '@/components/copy-path-button/copy-path-button'
import { workspaceHue } from '@/features/workspace/workspace-paths'

interface WorkspaceChooserProps {
  workspaces: Array<AgentWorkspace>
  loading: boolean
  error: string | null
  onSelect: (root: string) => void
  onAdd: () => void
}

export function WorkspaceChooser({
  workspaces,
  loading,
  error,
  onSelect,
  onAdd,
}: WorkspaceChooserProps) {
  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <h1 className={styles.title}>Choose a workspace</h1>

        <p className={styles.hint}>
          Each workspace gets its own window, tabs, and
          <code className={styles.code}>.excalidraw-ultimate/</code> state.
        </p>

        {error && <p className={styles.error}>{error}</p>}

        {loading && <p className={styles.hint}>Loading workspaces…</p>}

        <div className={styles.list}>
          {workspaces.map((workspace) => (
            <div key={workspace.root} className={styles.itemRow}>
              <button
                type="button"
                className={styles.item}
                onClick={() => onSelect(workspace.root)}
              >
                <span
                  className={styles.dot}
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

              <CopyPathButton path={workspace.root} />
            </div>
          ))}
        </div>

        <button type="button" className={styles.add} onClick={onAdd}>
          Add workspace…
        </button>
      </div>
    </div>
  )
}
