import { useEffect, useRef, useState } from 'react'
import styles from './path-dialog.module.css'
import { useRecentPaths } from '@/features/workspace/excalidraw-editor/hooks/use-recent-paths'
import { isAbsolutePath } from '@/features/workspace/workspace-paths'

export type PathDialogMode = 'open' | 'save' | 'workspace'

const LABELS: Record<
  PathDialogMode,
  { title: string; hint: string; action: string }
> = {
  open: {
    title: 'Open drawing',
    hint: 'Absolute path to a .excalidraw or .json file.',
    action: 'Open',
  },
  save: {
    title: 'Save drawing',
    hint: 'Absolute path to write this drawing to.',
    action: 'Save',
  },
  workspace: {
    title: 'Add workspace',
    hint: 'Absolute path to the project root.',
    action: 'Add workspace',
  },
}

interface PathDialogProps {
  mode: PathDialogMode
  initialPath?: string
  recentsKey: string
  onConfirm: (path: string) => Promise<void> | void
  onCancel: () => void
}

export function PathDialog({
  mode,
  initialPath = '',
  recentsKey,
  onConfirm,
  onCancel,
}: PathDialogProps) {
  const [value, setValue] = useState(initialPath)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { paths, remember } = useRecentPaths(recentsKey)
  const labels = LABELS[mode]

  const submit = async () => {
    const path = value.trim()

    if (!isAbsolutePath(path)) {
      setError('Enter an absolute path.')
      return
    }

    if (mode !== 'workspace' && !/\.(excalidraw|json)$/i.test(path)) {
      setError('The path must end with .excalidraw or .json.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      await onConfirm(path)
      remember(path)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Something went wrong.',
      )
    } finally {
      setBusy(false)
    }
  }

  // MARK: Effects

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  // MARK: Renderers

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={onCancel}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className={styles.title}>{labels.title}</h2>
        <p className={styles.hint}>{labels.hint}</p>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="/absolute/path"
            spellCheck={false}
            className={styles.input}
            aria-invalid={error !== null}
          />

          {paths.length > 0 && (
            <ul className={styles.recents}>
              {paths.slice(0, 4).map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    className={styles.recent}
                    onClick={() => setValue(path)}
                    title={path}
                  >
                    {path}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={onCancel}
            >
              Cancel
            </button>

            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Working…' : labels.action}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
