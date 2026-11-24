import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

/**
 * Shared locations and app discovery for the excalidraw-ultimate skill.
 *
 * Runtime state (logs, PIDs, browser profile) lives inside the checkout under
 * `.excalidraw-ultimate/runtime`, so a clone contains everything the skill
 * needs and nothing is scattered through the home directory.
 */

export const LIB_DIR = import.meta.dirname
export const SCRIPTS_DIR = path.resolve(LIB_DIR, '..')
export const SKILL_DIR = path.resolve(SCRIPTS_DIR, '..')

// MARK: Constants

const INSTALL_CONFIG = path.join(SKILL_DIR, 'install.json')
const STATE_DIR_NAME = '.excalidraw-ultimate'
const ENV_PREFIX = 'EXCALIDRAW_ULTIMATE_'
const ENV_FILE_NAME = '.env'

// MARK: Env file

/**
 * One `.env` file configures the skill and the app. It lives at the app root so
 * both readers find the same file; `EXCALIDRAW_ULTIMATE_ENV_FILE` points them
 * elsewhere. The shell wins, but it uses the same variable names.
 */
function envFileCandidates() {
  const installedRoot = readConfig()?.appRoot
  const checkoutRoot = path.resolve(SKILL_DIR, '..', '..')

  return [
    process.env.EXCALIDRAW_ULTIMATE_ENV_FILE,
    installedRoot ? path.join(installedRoot, ENV_FILE_NAME) : null,
    path.join(checkoutRoot, ENV_FILE_NAME),
  ].filter(Boolean)
}

let loadedEnvFile = null

/**
 * Loads the first `.env` file found without overriding the shell. Only
 * `EXCALIDRAW_ULTIMATE_*` keys are imported. A missing file is fine unless it
 * was named explicitly; a malformed one fails loudly.
 */
function loadEnvFile() {
  const explicit = process.env.EXCALIDRAW_ULTIMATE_ENV_FILE

  for (const file of new Set(
    envFileCandidates().map((candidate) => path.resolve(candidate)),
  )) {
    let text

    try {
      text = readFileSync(file, 'utf8')
    } catch (error) {
      if (
        explicit &&
        file === path.resolve(explicit) &&
        error.code === 'ENOENT'
      ) {
        throw new Error(
          `EXCALIDRAW_ULTIMATE_ENV_FILE points to a missing file: ${file}`,
        )
      }

      continue
    }

    let parsed

    try {
      parsed = parseEnv(text)
    } catch (error) {
      throw new Error(
        `Could not parse ${file}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith(ENV_PREFIX) && process.env[key] === undefined) {
        process.env[key] = value
      }
    }

    loadedEnvFile = file

    return
  }
}

loadEnvFile()

/** The `.env` file that was loaded, if any. */
export function envFile() {
  return loadedEnvFile
}

/** Reads one setting. Every setting has exactly one name: its env variable. */
export function setting(name) {
  const value = process.env[name]

  return value === undefined || value === '' ? undefined : value
}

/** Reads a positive integer setting, rejecting typos instead of yielding NaN. */
function numberSetting(name, fallback) {
  const raw = setting(name)

  if (raw === undefined) return fallback

  const value = Number(raw)

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}".`)
  }

  return value
}

/** Reads an absolute URL, normalised without a trailing slash. */
function urlSetting(name, fallback) {
  const raw = setting(name) ?? fallback

  let url

  try {
    url = new URL(raw)
  } catch {
    throw new Error(`${name} must be an absolute URL, got "${raw}".`)
  }

  return url.href.replace(/\/$/, '')
}

// MARK: App settings

export const BASE_URL = urlSetting(
  'EXCALIDRAW_ULTIMATE_URL',
  'http://localhost:3000',
)

export const CDP_PORT = numberSetting('EXCALIDRAW_ULTIMATE_CDP_PORT', 9333)

export const CDP_URL = `http://127.0.0.1:${CDP_PORT}`

export const AGENT_HEALTH_URL = `${BASE_URL}/__excalidraw/agent/health`

// MARK: State paths

/** Runtime state for this checkout: logs, PIDs, and the debug browser profile. */
export function stateDir() {
  const override = setting('EXCALIDRAW_ULTIMATE_STATE_DIR')

  if (override) return path.resolve(override)

  return path.join(resolveAppRoot(), STATE_DIR_NAME, 'runtime')
}

/** Per-workspace state: tabs, recovery scenes, snapshots, screenshots. */
export function workspaceStateDir(root) {
  return path.join(root, STATE_DIR_NAME)
}

export function devServerLogPath() {
  return path.join(stateDir(), 'dev-server.log')
}

export function devServerPidPath() {
  return path.join(stateDir(), 'dev-server.pid')
}

export function browserPidPath() {
  return path.join(stateDir(), 'debug-browser.pid')
}

export function browserProfilePath() {
  return path.join(stateDir(), 'debug-browser-profile')
}

export function ensureStateDir() {
  const directory = stateDir()

  mkdirSync(directory, { recursive: true })

  return directory
}

// MARK: Install record

/**
 * Reads the install record that a copied skill carries. A symlinked skill
 * resolves back to this checkout, so it does not need one.
 */
export function readConfig() {
  try {
    return JSON.parse(readFileSync(INSTALL_CONFIG, 'utf8'))
  } catch {
    return null
  }
}

/** Writes an install record into a copied skill directory. */
export function writeConfig(directory, config) {
  mkdirSync(directory, { recursive: true })

  writeFileSync(
    path.join(directory, 'install.json'),
    `${JSON.stringify(config, null, 2)}\n`,
  )
}

// MARK: Project root

/**
 * Resolves the project this command belongs to. Agents run from a repo, so the
 * git root is the natural workspace key; `EXCALIDRAW_ULTIMATE_PROJECT` can
 * override it for unusual layouts.
 */
export function resolveProjectRoot() {
  const override = setting('EXCALIDRAW_ULTIMATE_PROJECT')

  if (override) return path.resolve(override)

  try {
    const topLevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    if (topLevel) return path.resolve(topLevel)
  } catch {
    // Not a git checkout: fall back to the working directory.
  }

  return process.cwd()
}

// MARK: Workspace URL

/** URL of the app page dedicated to a workspace. */
export function workspaceUrl(root) {
  const url = new URL(BASE_URL)

  url.searchParams.set('workspace', root)

  return url.toString()
}

// MARK: App discovery

function isAppRoot(candidate) {
  return existsSync(
    path.join(candidate, 'apps', 'excalidraw-client', 'package.json'),
  )
}

function isClientPackage(candidate) {
  const packagePath = path.join(candidate, 'package.json')

  if (!existsSync(packagePath)) return false

  try {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
    return pkg.name === '@apps/excalidraw-client'
  } catch {
    return false
  }
}

function walkForAppRoot(start) {
  let current = path.resolve(start)
  let previous = null

  while (current !== previous) {
    if (isAppRoot(current)) return current
    if (isClientPackage(current)) return path.resolve(current, '..', '..')

    previous = current
    current = path.dirname(current)
  }

  return null
}

/**
 * Resolves the monorepo that contains apps/excalidraw-client, in order:
 * env override, the installed skill's record, current directory tree, the
 * skill's own checkout.
 */
export function resolveAppRoot() {
  const candidates = [
    setting('EXCALIDRAW_ULTIMATE_ROOT'),
    readConfig()?.appRoot,
    walkForAppRoot(process.cwd()),
    walkForAppRoot(SKILL_DIR),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)

    if (isAppRoot(resolved)) return resolved
  }

  throw new Error(
    [
      'Could not locate the Excalidraw Ultimate checkout.',
      '',
      'Install the skill from the repo (scripts/install.mjs records the path),',
      'or set EXCALIDRAW_ULTIMATE_ROOT to the monorepo root:',
      '  EXCALIDRAW_ULTIMATE_ROOT=/path/to/excalidraw-ultimate node ...',
    ].join('\n'),
  )
}

// MARK: Version

export function packageVersion(appRoot) {
  try {
    const pkg = JSON.parse(
      readFileSync(
        path.join(appRoot, 'apps', 'excalidraw-client', 'package.json'),
        'utf8',
      ),
    )

    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}
