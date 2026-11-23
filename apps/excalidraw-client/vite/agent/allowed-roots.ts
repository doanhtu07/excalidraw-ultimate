import path from 'node:path'
import { loadEnv } from 'vite'
import { ALLOWED_ROOTS_ENV } from './paths.ts'

/** Splits a `path.delimiter`-separated list into absolute, deduped roots. */
export function parseAllowedRoots(value: string | undefined): Array<string> {
  if (!value) return []

  const roots = value
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry))

  return [...new Set(roots)]
}

/**
 * Resolves the drawing allow-list for the dev server.
 *
 * `EXCALIDRAW_ULTIMATE_ALLOWED_ROOTS` accepts several directories separated by
 * the platform path delimiter (`:` on macOS/Linux, `;` on Windows), so parallel
 * projects can share one dev server. Shell exports win; otherwise Vite's
 * `.env` files in the app directory are read.
 */
export function resolveAllowedRoots(
  mode: string,
  envDir: string | false,
): Array<string> {
  const fromProcess = process.env[ALLOWED_ROOTS_ENV]

  if (fromProcess !== undefined) return parseAllowedRoots(fromProcess)
  if (envDir === false) return []

  const env = loadEnv(mode, envDir, 'EXCALIDRAW_ULTIMATE_')

  return parseAllowedRoots(env[ALLOWED_ROOTS_ENV])
}
