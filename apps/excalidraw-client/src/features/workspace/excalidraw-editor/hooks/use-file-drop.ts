import { useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'

export interface FileDropProps {
  onDropFile: (file: File) => void
}

export interface FileDropHandlers {
  isDraggingFiles: boolean
  handleDragOver: (event: ReactDragEvent) => void
  handleDragLeave: (event: ReactDragEvent) => void
  handleDrop: (event: ReactDragEvent) => void
}

/**
 * Drag-and-drop support for opening drawings: tracks whether files are being
 * dragged over the workspace and forwards dropped drawings to `onDropFile`.
 */
export function useFileDrop({ onDropFile }: FileDropProps): FileDropHandlers {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)

  const handleDragOver = (event: ReactDragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return

    event.preventDefault()
    setIsDraggingFiles(true)
  }

  const handleDragLeave = (event: ReactDragEvent) => {
    if (
      event.relatedTarget &&
      event.currentTarget.contains(event.relatedTarget as Node)
    )
      return

    setIsDraggingFiles(false)
  }

  const handleDrop = (event: ReactDragEvent) => {
    event.preventDefault()
    setIsDraggingFiles(false)

    for (const file of event.dataTransfer.files) {
      const isDrawing =
        file.name.endsWith('.excalidraw') ||
        file.type.includes('json') ||
        file.type === 'image/png'

      if (isDrawing) onDropFile(file)
    }
  }

  return {
    isDraggingFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
