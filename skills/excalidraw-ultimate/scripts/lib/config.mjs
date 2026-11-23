import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

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

const INSTALL_CONFIG = path.join(SKILL_DIR, 'install.json')
const STATE_DIR_NAME = '.excalidraw-ultimate'

export const BASE_URL =
  process.env.EXCALIDRAW_ULTIMATE_URL ?? 'http://localhost:3000'

export const CDP_PORT = Number(
  process.env.EXCALIDRAW_ULTIMATE_CDP_PORT ?? '9333',
)

export const CDP_URL = `http://127.0.0.1:${CDP_PORT}`

export const AGENT_HEALTH_URL = `${BASE_URL}/__excalidraw/agent/health`

/** Runtime state for this checkout: logs, PIDs, and the debug browser profile. */
export function stateDir() {
  const override = process.env.EXCALIDRAW_ULTIMATE_STATE_DIR

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

/**
 * Resolves the project this command belongs to. Agents run from a repo, so the
 * git root is the natural workspace key; `EXCALIDRAW_ULTIMATE_PROJECT` can
 * override it for unusual layouts.
 */
export function resolveProjectRoot() {
  const override = process.env.EXCALIDRAW_ULTIMATE_PROJECT

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

/** URL of the app page dedicated to a workspace. */
export function workspaceUrl(root) {
  const url = new URL(BASE_URL)

  url.searchParams.set('workspace', root)

  return url.toString()
}

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
    process.env.EXCALIDRAW_ULTIMATE_ROOT,
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
