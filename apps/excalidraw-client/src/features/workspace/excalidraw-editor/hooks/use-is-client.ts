import { useEffect, useState } from 'react'

/**
 * A `true` flag that flips after the first render.
 *
 * Excalidraw relies on browser APIs, so the canvas is only rendered on the
 * client; during SSR this returns `false`.
 */
export function useIsClient(): boolean {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsClient(true)
  }, [])

  return isClient
}
