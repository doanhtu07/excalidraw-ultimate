#!/usr/bin/env node
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  SKILL_DIR,
  readConfig,
  resolveProjectRoot,
  writeConfig,
} from './lib/config.mjs'
import {
  destinationFor,
  globalTargets,
  installAt,
  projectTargets,
  rootExists,
  skillName,
} from './lib/agent-targets.mjs'

// MARK: Setup

const GUESSED_ROOT = path.resolve(SKILL_DIR, '..', '..')
const REPO_ROOT = existsSync(
  path.join(GUESSED_ROOT, 'apps', 'excalidraw-client', 'package.json'),
)
  ? GUESSED_ROOT
  : (readConfig()?.appRoot ?? GUESSED_ROOT)
const NAME = skillName(SKILL_DIR)
const PROJECT_ROOT = resolveProjectRoot()

// MARK: Usage

const USAGE = `Install the excalidraw-ultimate skill for coding agents.

Usage:
  node scripts/install.mjs [options]

Options:
  --global            Install into the agents' global skill directories (default)
  --project           Install into the project you run this from
                      (.claude/skills, .opencode/skills, .agents/skills)
  --target <names>    Comma-separated: claude, opencode, agents
                      (default: every agent config that already exists)
  --all               Create every known target directory
  --copy              Copy instead of symlinking (default: symlink)
  --force             Replace a different skill at the destination
  --dry-run           Show what would change
  --json              Machine-readable output
  --help

Examples:
  node scripts/install.mjs
  node scripts/install.mjs --target claude,opencode
  cd ../my-project && node /path/to/excalidraw-ultimate/skills/excalidraw-ultimate/scripts/install.mjs --project --copy
`

// MARK: Arguments

function parse(argv) {
  const options = {
    scope: 'global',
    targets: [],
    copy: false,
    force: false,
    dryRun: false,
    all: false,
    json: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--global') options.scope = 'global'
    else if (argument === '--project' || argument === '--local')
      options.scope = 'project'
    else if (argument === '--copy') options.copy = true
    else if (argument === '--force') options.force = true
    else if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--all') options.all = true
    else if (argument === '--json') options.json = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else if (argument.startsWith('--target=')) {
      options.targets.push(...argument.slice('--target='.length).split(','))
    } else if (argument === '--target') {
      const value = argv[index + 1]

      if (!value) throw new Error('--target needs a comma-separated value.')

      options.targets.push(...value.split(','))
      index += 1
    } else {
      throw new Error(`Unknown option "${argument}".`)
    }
  }

  options.targets = options.targets.map((name) => name.trim()).filter(Boolean)

  return options
}

// MARK: Errors

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

// MARK: Install

function main() {
  const options = parse(process.argv.slice(2))

  if (options.help) {
    console.log(USAGE)
    return
  }

  if (
    !existsSync(
      path.join(REPO_ROOT, 'apps', 'excalidraw-client', 'package.json'),
    )
  ) {
    fail(
      `This skill must be installed from the Excalidraw Ultimate checkout (looked for ${REPO_ROOT}).`,
    )
  }

  // MARK: Targets

  const roots =
    options.scope === 'project' ? projectTargets(PROJECT_ROOT) : globalTargets()
  const known = Object.keys(roots)
  const requested = options.targets.filter((name) => name !== 'all')

  if (options.targets.includes('all')) options.all = true

  for (const name of requested) {
    if (!known.includes(name)) {
      fail(`Unknown target "${name}". Choose: ${known.join(', ')}.`)
    }
  }

  const names = options.all
    ? known
    : options.targets.length
      ? requested
      : known.filter((name) => rootExists(roots[name]))

  if (names.length === 0) {
    names.push('claude')
  }

  // MARK: Installs

  const installed = []
  const skipped = []

  for (const name of names) {
    const target = roots[name]

    if (!target) {
      skipped.push({ name, reason: 'unknown target' })
      continue
    }

    const destination = destinationFor(target, NAME)

    try {
      const method = installAt(SKILL_DIR, destination, {
        copy: options.copy,
        force: options.force,
        dryRun: options.dryRun,
      })

      installed.push({
        target: name,
        label: target.label,
        destination,
        method,
      })
    } catch (error) {
      skipped.push({ name, reason: error.message })
    }
  }

  const config = {
    version: 1,
    appRoot: REPO_ROOT,
    skillDir: SKILL_DIR,
    skillName: NAME,
    installedAt: new Date().toISOString(),
    targets: installed.map((entry) => entry.destination),
  }

  if (!options.dryRun) {
    // A symlinked skill resolves back to this checkout; a copied skill needs
    // a local record so it can still find the app root.
    for (const entry of installed) {
      if (entry.method === 'copy' || entry.method === 'copy-fallback') {
        writeConfig(entry.destination, config)
      }
    }
  }

  // MARK: Report

  const startScript = path.join(
    installed[0]?.destination ?? SKILL_DIR,
    'scripts',
    'excalidraw.mjs',
  )
  const uninstallScript = path.join(SKILL_DIR, 'scripts', 'uninstall.mjs')

  if (options.json) {
    console.log(JSON.stringify({ installed, skipped, config }, null, 2))
    return
  }

  console.log(
    options.dryRun
      ? `Would install ${NAME} (${options.scope}):`
      : `Installed ${NAME} (${options.scope}):`,
  )

  for (const entry of installed) {
    const arrow =
      entry.method === 'copy' || entry.method === 'copy-fallback'
        ? 'copy'
        : 'link'

    console.log(`  ✓ ${entry.label.padEnd(22)} ${entry.destination} (${arrow})`)
  }

  for (const entry of skipped) {
    console.log(`  ! ${entry.name.padEnd(22)} skipped: ${entry.reason}`)
  }

  console.log('')
  console.log(
    `State:     ${path.join(REPO_ROOT, '.excalidraw-ultimate', 'runtime')}`,
  )
  console.log(`Start:     node "${startScript}" open <drawing.excalidraw>`)
  console.log(
    `Uninstall: node "${uninstallScript}"${options.scope === 'project' ? ' --project' : ''}`,
  )
  console.log('')
  console.log('Agent prompt (paste into a coding agent):')
  console.log(
    `  Use the ${NAME} skill. Run node "${startScript}" open <path/to/drawing.excalidraw>,`,
  )
  console.log(
    '  read the SKILL.md first, then describe → edit → screenshot → fix loop.',
  )
}

main()
