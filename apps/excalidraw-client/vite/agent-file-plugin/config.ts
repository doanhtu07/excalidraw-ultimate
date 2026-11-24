import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { ALLOWED_ROOTS_ENV } from './paths.ts'

/** The settings the dev server shares with the skill through one `.env` file. */
export interface AppSettings {
  allowedRoots: Array<string>
  appUrl: string
}

const APP_URL_ENV = 'EXCALIDRAW_ULTIMATE_URL'
const ENV_FILE_ENV = 'EXCALIDRAW_ULTIMATE_ENV_FILE'
const ENV_FILE_NAME = '.env'
const DEFAULT_APP_URL = 'http://localhost:3000'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined

  const code = (error as { code?: unknown }).code

  return typeof code === 'string' ? code : undefined
}

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
 * Resolves the `.env` file shared with the skill scripts: the app root, unless
 * `EXCALIDRAW_ULTIMATE_ENV_FILE` points somewhere else.
 */
function resolveEnvFile(appRoot: string): string {
  const override = process.env[ENV_FILE_ENV]

  if (override) return path.resolve(override)

  return path.join(path.resolve(appRoot, '..', '..'), ENV_FILE_NAME)
}

/** Parses that one file. A missing file is only an error when it was named. */
function readEnvFile(file: string): Record<string, string | undefined> {
  let text: string

  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      throw new Error(`Could not read ${file}: ${errorMessage(error)}`)
    }

    if (process.env[ENV_FILE_ENV]) {
      throw new Error(`${ENV_FILE_ENV} points to a missing file: ${file}`)
    }

    return {}
  }

  try {
    return parseEnv(text)
  } catch (error) {
    throw new Error(`Could not parse ${file}: ${errorMessage(error)}`)
  }
}

/** The shell wins over the file, and the file wins over the default. */
function readSetting(
  values: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const value = process.env[name] ?? values[name]

  return value === undefined || value === '' ? undefined : value
}

/** Port the dev server binds, derived from the configured app URL. */
export function portFromAppUrl(appUrl: string): number {
  const url = new URL(appUrl)

  if (url.port) return Number(url.port)

  return url.protocol === 'https:' ? 443 : 80
}

/** Reads the settings the dev server needs from the shared `.env` file. */
export function readAppSettings(appRoot: string): AppSettings {
  const values = readEnvFile(resolveEnvFile(appRoot))
  const rawUrl = readSetting(values, APP_URL_ENV) ?? DEFAULT_APP_URL

  let appUrl: string

  try {
    appUrl = new URL(rawUrl).href.replace(/\/$/, '')
  } catch {
    throw new Error(`${APP_URL_ENV} must be an absolute URL, got "${rawUrl}".`)
  }

  return {
    allowedRoots: parseAllowedRoots(readSetting(values, ALLOWED_ROOTS_ENV)),
    appUrl,
  }
}
