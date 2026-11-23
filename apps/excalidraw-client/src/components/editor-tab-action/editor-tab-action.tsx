import styles from './editor-tab-action.module.css'
import type { ReactNode } from 'react'

interface EditorTabActionProps {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}

export function EditorTabAction({
  label,
  onClick,
  disabled,
  children,
}: EditorTabActionProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={styles.action}
    >
      {children}
    </button>
  )
}
