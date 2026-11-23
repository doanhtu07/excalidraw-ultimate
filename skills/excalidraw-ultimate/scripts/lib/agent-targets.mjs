import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export const MARKER = '.excalidraw-ultimate.json'

export function skillName(skillDir) {
  return path.basename(skillDir)
}

/** Standard global skill roots for the coding agents this repo targets. */
export function globalTargets() {
  const home = homedir()
  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(home, '.config')

  return {
    claude: {
      label: 'Claude Code',
      root: path.join(
        process.env.CLAUDE_CONFIG_DIR ?? path.join(home, '.claude'),
        'skills',
      ),
    },
    opencode: {
      label: 'OpenCode',
      root: path.join(configHome, 'opencode', 'skills'),
    },
    agents: {
      label: 'General agents',
      root: path.join(home, '.agents', 'skills'),
    },
  }
}

/** Project-local skill roots, for agents working inside this checkout. */
export function projectTargets(repoRoot) {
  return {
    claude: {
      label: 'Claude Code (project)',
      root: path.join(repoRoot, '.claude', 'skills'),
    },
    opencode: {
      label: 'OpenCode (project)',
      root: path.join(repoRoot, '.opencode', 'skills'),
    },
    agents: {
      label: 'General agents (project)',
      root: path.join(repoRoot, '.agents', 'skills'),
    },
  }
}

function safeLstat(target) {
  try {
    return lstatSync(target)
  } catch {
    return null
  }
}

export function isOurInstall(destination, skillDir) {
  const stat = safeLstat(destination)

  if (!stat) return false

  if (stat.isSymbolicLink()) {
    try {
      return realpathSync(destination) === realpathSync(skillDir)
    } catch {
      return false
    }
  }

  try {
    const marker = JSON.parse(
      readFileSync(path.join(destination, MARKER), 'utf8'),
    )

    return marker.source === skillDir
  } catch {
    return false
  }
}

function copySkill(skillDir, destination) {
  cpSync(skillDir, destination, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.DS_Store`),
  })

  writeFileSync(
    path.join(destination, MARKER),
    `${JSON.stringify({ source: skillDir, installedAt: new Date().toISOString() }, null, 2)}\n`,
  )
}

/**
 * Installs (or refreshes) the skill at one destination. Returns the method
 * used: "symlink", "copy", "update", or "dry-run".
 */
export function installAt(skillDir, destination, options = {}) {
  const { copy = false, force = false, dryRun = false } = options
  const existing = safeLstat(destination)

  if (existing) {
    if (!isOurInstall(destination, skillDir) && !force) {
      throw new Error(
        `${destination} already exists and is not this skill. Re-run with --force to replace it.`,
      )
    }

    if (dryRun) return 'dry-run'

    rmSync(destination, { recursive: true, force: true })
  }

  if (dryRun) return 'dry-run'

  mkdirSync(path.dirname(destination), { recursive: true })

  if (!copy) {
    try {
      const linkTarget =
        process.platform === 'win32'
          ? skillDir
          : path.relative(path.dirname(destination), skillDir) || skillDir

      symlinkSync(
        linkTarget,
        destination,
        process.platform === 'win32' ? 'junction' : 'dir',
      )

      return existing ? 'update' : 'symlink'
    } catch {
      // Windows without developer mode cannot symlink without elevation.
      copySkill(skillDir, destination)
      return 'copy-fallback'
    }
  }

  copySkill(skillDir, destination)

  return existing ? 'update' : 'copy'
}

export function removeAt(skillDir, destination, options = {}) {
  const { force = false, dryRun = false } = options

  if (!safeLstat(destination)) return 'absent'

  if (!isOurInstall(destination, skillDir) && !force) return 'not-ours'

  if (dryRun) return 'would-remove'

  rmSync(destination, { recursive: true, force: true })

  return 'removed'
}

export function destinationFor(target, name) {
  return path.join(target.root, name)
}

export function rootExists(target) {
  return existsSync(target.root) || existsSync(path.dirname(target.root))
}
