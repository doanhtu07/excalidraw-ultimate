import { useCallback, useState } from 'react'

const MAX_RECENTS = 8

function read(key: string): Array<string> {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []

    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

export interface RecentPaths {
  paths: Array<string>
  remember: (value: string) => void
}

/** Remembers recently used absolute paths in localStorage. */
export function useRecentPaths(key: string): RecentPaths {
  const [paths, setPaths] = useState<Array<string>>(() => read(key))

  const remember = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return

      setPaths((prev) => {
        const next = [
          trimmed,
          ...prev.filter((item) => item !== trimmed),
        ].slice(0, MAX_RECENTS)

        try {
          localStorage.setItem(key, JSON.stringify(next))
        } catch {
          // Recents are a convenience; storage failures are harmless.
        }

        return next
      })
    },
    [key],
  )

  return { paths, remember }
}
