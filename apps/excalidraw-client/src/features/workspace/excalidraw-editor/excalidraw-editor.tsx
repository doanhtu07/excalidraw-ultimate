import styles from './excalidraw-editor.module.css'
import { useIsClient } from './hooks/use-is-client'
import { WorkspaceApp } from '@/features/workspace/workspace-app'

/**
 * Client gate: Excalidraw touches browser APIs at module scope, so the
 * workspace UI only mounts after hydration.
 */
export function ExcalidrawEditor() {
  const isClient = useIsClient()

  if (!isClient) {
    return (
      <div className={styles.fallback}>
        <p className={styles.fallbackText}>Loading canvas…</p>
      </div>
    )
  }

  return <WorkspaceApp />
}
