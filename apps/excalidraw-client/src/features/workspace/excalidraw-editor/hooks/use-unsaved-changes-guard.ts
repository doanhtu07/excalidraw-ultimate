import { useEffect } from 'react'

export interface UnsavedChangesGuardProps {
  hasUnsavedTabs: boolean
}

/**
 * Prevents closing the tab or window while any drawing has unsaved changes.
 * The browser shows its own confirmation prompt.
 */
export function useUnsavedChangesGuard({
  hasUnsavedTabs,
}: UnsavedChangesGuardProps): void {
  useEffect(() => {
    if (!hasUnsavedTabs) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedTabs])
}
