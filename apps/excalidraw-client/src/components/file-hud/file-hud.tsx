import styles from './file-hud.module.css'
import type { EditorTab } from '@/features/workspace/editor-tabs'

interface FileHudProps {
  tab: EditorTab
}

/**
 * A status strip under the tab bar (part of the app UI, never part of the
 * drawing) that names the active file, so screenshots identify the drawing.
 */
export function FileHud({ tab }: FileHudProps) {
  const label = tab.filePath ?? `${tab.name} (unsaved)`

  if (new URLSearchParams(window.location.search).get('hud') === '0') {
    return null
  }

  return (
    <div
      className={styles.root}
      data-agent-file-path={tab.filePath ?? ''}
      title={label}
    >
      <span className={styles.label}>file</span>
      <span className={styles.path}>{label}</span>
      {tab.dirty && <span className={styles.dirty}>unsaved</span>}
    </div>
  )
}
