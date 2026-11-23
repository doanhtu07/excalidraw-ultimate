import { normalizeAgentElements } from '../agent-scene'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

/**
 * Converts agent-friendly skeletons into real elements, preloading the drawing
 * fonts so text is measured with the face it will render with.
 */
export async function createElementsFromSkeletons(
  skeletons: Array<unknown>,
): Promise<Array<ExcalidrawElement>> {
  // Excalidraw measures text when the element is created. If the Excalifont
  // (or another drawing font) has not loaded yet, the measurement falls back
  // to a narrower font and the stored text box clips the glyphs later.
  // Loading the faces first keeps labels intact.
  await Promise.allSettled(
    [
      'Excalifont',
      'Virgil',
      'Cascadia Code',
      'Nunito',
      'Lilita One',
      'Comic Shanns',
      'Helvetica',
    ].map((family) => document.fonts.load(`20px "${family}"`)),
  )

  const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw')

  return convertToExcalidrawElements(normalizeAgentElements(skeletons), {
    regenerateIds: false,
  })
}
