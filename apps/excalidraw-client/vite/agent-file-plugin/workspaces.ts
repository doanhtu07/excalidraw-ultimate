import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { AgentFileError } from './errors.ts'
import { isRecord } from './http.ts'
import { resolveDirectoryPath } from './paths.ts'
import type { InitializedWorkspacePayload, WorkspaceEntry } from './types.ts'

const WORKSPACE_STATE_DIR = '.excalidraw-ultimate'
const WORKSPACE_RECOVERY_DIR = 'recovery'
const WORKSPACES_FILE = 'workspaces.json'

// Registry updates are read-modify-write; serialize them so two pages opening
// at once cannot lose each other's entries.
let registryQueue: Promise<void> = Promise.resolve()

/** Finds the cloned checkout so its state can live inside the repo. */
function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir)

  for (;;) {
    if (
      existsSync(path.join(current, 'pnpm-workspace.yaml')) ||
      existsSync(path.join(current, '.git'))
    ) {
      return current
    }

    const parent = path.dirname(current)

    if (parent === current) return path.resolve(startDir)

    current = parent
  }
}

function registryDir(appRoot: string): string {
  return path.join(findRepoRoot(appRoot), WORKSPACE_STATE_DIR)
}

function isWorkspaceEntry(value: unknown): value is WorkspaceEntry {
  return (
    isRecord(value) &&
    typeof value.root === 'string' &&
    typeof value.name === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

export async function readWorkspaceRegistry(
  appRoot: string,
): Promise<Array<WorkspaceEntry>> {
  try {
    const text = await fs.readFile(
      path.join(registryDir(appRoot), WORKSPACES_FILE),
      'utf8',
    )

    const parsed = JSON.parse(text) as unknown

    if (!isRecord(parsed) || !Array.isArray(parsed.workspaces)) return []

    return parsed.workspaces.filter(isWorkspaceEntry)
  } catch {
    return []
  }
}

async function writeWorkspaceRegistry(
  appRoot: string,
  workspaces: ReadonlyArray<WorkspaceEntry>,
): Promise<void> {
  const directory = registryDir(appRoot)

  await fs.mkdir(directory, { recursive: true })

  // The registry lives inside the checkout; never let it reach git.
  const gitignore = path.join(directory, '.gitignore')

  try {
    await fs.access(gitignore)
  } catch {
    await fs.writeFile(gitignore, '*\n', 'utf8')
  }

  const tempPath = path.join(
    directory,
    `.workspaces.${process.pid}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2)}.tmp`,
  )

  try {
    await fs.writeFile(
      tempPath,
      `${JSON.stringify({ version: 1, workspaces }, null, 2)}\n`,
      'utf8',
    )

    await fs.rename(tempPath, path.join(directory, WORKSPACES_FILE))
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }
}

async function assertDirectory(absolutePath: string): Promise<void> {
  let stat

  try {
    stat = await fs.stat(absolutePath)
  } catch {
    throw new AgentFileError(404, `Directory not found: ${absolutePath}`)
  }

  if (!stat.isDirectory()) {
    throw new AgentFileError(400, `Not a directory: ${absolutePath}`)
  }
}

export async function registerWorkspace(input: {
  rootInput: string
  name: string | undefined
  allowedRoots: ReadonlyArray<string>
  appRoot: string
}): Promise<WorkspaceEntry> {
  const { rootInput, name, allowedRoots, appRoot } = input

  const root = resolveDirectoryPath(rootInput, allowedRoots)

  await assertDirectory(root)

  const entry: WorkspaceEntry = {
    root,
    name: name?.trim() || path.basename(root) || root,
    updatedAt: new Date().toISOString(),
  }

  const update = async () => {
    const workspaces = await readWorkspaceRegistry(appRoot)
    const next = [entry, ...workspaces.filter((item) => item.root !== root)]

    await writeWorkspaceRegistry(appRoot, next.slice(0, 100))
  }

  const run = registryQueue.then(update, update)
  registryQueue = run.then(
    () => {},
    () => {},
  )
  await run

  return entry
}

export async function initializeWorkspace(input: {
  rootInput: string
  name: string | undefined
  allowedRoots: ReadonlyArray<string>
  appRoot: string
}): Promise<InitializedWorkspacePayload> {
  const { rootInput, name, allowedRoots, appRoot } = input

  const root = resolveDirectoryPath(rootInput, allowedRoots)

  await assertDirectory(root)

  const stateDir = path.join(root, WORKSPACE_STATE_DIR)
  const recoveryDir = path.join(stateDir, WORKSPACE_RECOVERY_DIR)

  await fs.mkdir(recoveryDir, { recursive: true })

  const gitignore = path.join(stateDir, '.gitignore')

  try {
    await fs.access(gitignore)
  } catch {
    await fs.writeFile(gitignore, '*\n', 'utf8')
  }

  let workspace: WorkspaceEntry

  try {
    workspace = await registerWorkspace({
      rootInput: root,
      name,
      allowedRoots,
      appRoot,
    })
  } catch {
    // The switcher registry is a convenience; persistence still works when
    // the checkout is read-only.
    workspace = {
      root,
      name: name?.trim() || path.basename(root) || root,
      updatedAt: new Date().toISOString(),
    }
  }

  return { workspace, stateDir, recoveryDir }
}
