import { useEffect } from 'react'

export interface SaveShortcutProps {
  saveActiveDrawing: () => Promise<void>
}

/**
 * Saves the active drawing when the user presses Cmd/Ctrl+S.
 *
 * Listens in the capture phase on `window` and stops propagation: without
 * that, Excalidraw's own Cmd+S shortcut handles the event first (it saves
 * with its own dialog and stops the event), so this app never learns the
 * drawing was saved and the tab keeps showing it as dirty.
 */
export function useSaveShortcut({
  saveActiveDrawing,
}: SaveShortcutProps): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 's'
      ) {
        event.preventDefault()
        event.stopPropagation()
        void saveActiveDrawing()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [saveActiveDrawing])
}
