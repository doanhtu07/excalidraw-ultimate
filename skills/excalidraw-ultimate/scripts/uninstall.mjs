#!/usr/bin/env node
import { SKILL_DIR, resolveProjectRoot } from './lib/config.mjs'
import {
  destinationFor,
  globalTargets,
  projectTargets,
  removeAt,
  skillName,
} from './lib/agent-targets.mjs'

// MARK: Setup

const NAME = skillName(SKILL_DIR)
const PROJECT_ROOT = resolveProjectRoot()

// MARK: Usage

const USAGE = `Remove the excalidraw-ultimate skill from agent skill directories.

Usage:
  node scripts/uninstall.mjs [options]

Options:
  --global            Remove from global agent directories (default)
  --project           Remove from the project you run this from
  --all               Remove from both global and project directories
  --target <names>    Comma-separated: claude, opencode, agents
  --force             Remove even when the destination is not this skill
  --dry-run           Show what would change
  --json              Machine-readable output
  --help
`

// MARK: Arguments

function parse(argv) {
  const options = {
    scopes: ['global'],
    targets: [],
    force: false,
    dryRun: false,
    json: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--global') options.scopes = ['global']
    else if (argument === '--project' || argument === '--local')
      options.scopes = ['project']
    else if (argument === '--all') options.scopes = ['global', 'project']
    else if (argument === '--force') options.force = true
    else if (argument === '--dry-run') options.dryRun = true
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

// MARK: Targets

function targetsFor(scope) {
  return scope === 'project' ? projectTargets(PROJECT_ROOT) : globalTargets()
}

// MARK: Uninstall

function main() {
  const options = parse(process.argv.slice(2))

  if (options.help) {
    console.log(USAGE)
    return
  }

  // MARK: Removal

  const results = []

  for (const scope of options.scopes) {
    const roots = targetsFor(scope)
    const known = Object.keys(roots)
    const requested = options.targets.filter((name) => name !== 'all')
    const names =
      options.targets.includes('all') || options.targets.length === 0
        ? known
        : requested

    for (const name of names) {
      const target = roots[name]

      if (!target) {
        results.push({ scope, target: name, status: 'unknown' })
        continue
      }

      const destination = destinationFor(target, NAME)

      results.push({
        scope,
        target: name,
        label: target.label,
        destination,
        status: removeAt(SKILL_DIR, destination, {
          force: options.force,
          dryRun: options.dryRun,
        }),
      })
    }
  }

  const removed = results.filter(
    (entry) => entry.status === 'removed' || entry.status === 'would-remove',
  )

  // MARK: Report

  if (options.json) {
    console.log(JSON.stringify({ results }, null, 2))
    return
  }

  console.log(`Uninstall ${NAME}:`)

  for (const entry of results) {
    console.log(
      `  ${entry.status.padEnd(9)} ${entry.label ?? entry.target} ${entry.destination ?? ''}`,
    )
  }

  if (removed.length === 0) {
    console.log(
      '\nNothing was removed (the skill was not installed in those targets).',
    )
  }

  if (results.some((entry) => entry.status === 'not-ours')) {
    console.log(
      '\nSome destinations belong to a different skill. Re-run with --force only if you are sure.',
    )
  }
}

main()
