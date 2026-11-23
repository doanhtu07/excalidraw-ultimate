#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  BASE_URL,
  devServerLogPath,
  resolveAppRoot,
  resolveProjectRoot,
  workspaceStateDir,
  workspaceUrl,
} from './lib/config.mjs'
import {
  cdpStatus,
  closePage,
  connectToApp,
  findPageTarget,
  listAppPages,
  navigate,
  openCdp,
  stopBrowser,
  waitForBridge,
} from './lib/browser.mjs'
import {
  appHealth,
  ensureDevServer,
  readLogTail,
  stopDevServer,
} from './lib/dev-server.mjs'
import { sleep, waitFor } from './lib/http.mjs'

// MARK: Usage

const BOOLEAN_FLAGS = new Set([
  'yes',
  'json',
  'full',
  'canvas',
  'fit',
  'scroll',
  'headless',
  'no-animate',
  'help',
  'all',
])

const USAGE = `excalidraw-ultimate — drive the Excalidraw Ultimate client

Usage:
  node scripts/excalidraw.mjs <command> [options]

Read:
  status                         Dev server, debug browser, bridge, tabs
  open <file.excalidraw>         Open a drawing by absolute/relative path
  describe [--json]              Compact element summary of the active drawing
  elements                       Full scene JSON of the active drawing

Write:
  add [file|-] [--one '<json>'] [--scroll]
  apply [file|-]                 {"create":[...],"update":[...],"delete":[...]}
  update <id> --set '<json>'
  delete <id...>
  clear --yes
  save

Look:
  screenshot [--out <file.png>] [--canvas] [--full]
  viewport [--fit] [--ids a,b] [--zoom 1.5] [--no-animate]

Safety:
  snapshot save|list|restore <name>

Lifecycle:
  close                          Close this workspace's page
  stop                           Stop this workspace; stop browser/server if last
  stop --all                     Stop the debug browser and our dev server

Environment:
  EXCALIDRAW_ULTIMATE_ROOT       Monorepo root (normally written by install)
  EXCALIDRAW_ULTIMATE_PROJECT    Workspace root (default: git root of cwd)
  EXCALIDRAW_ULTIMATE_URL        App URL (default ${BASE_URL})
  EXCALIDRAW_ULTIMATE_CDP_PORT   Debug port (default 9333)
  EXCALIDRAW_ULTIMATE_BROWSER    Chrome/Brave/Edge binary override
`

// MARK: Arguments

function parseArgs(argv) {
  const flags = {}
  const positional = []

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--') {
      positional.push(...argv.slice(index + 1))
      break
    }

    if (!argument.startsWith('--')) {
      positional.push(argument)
      continue
    }

    const [key, inline] = argument.slice(2).split('=')

    if (inline !== undefined) {
      flags[key] = inline
    } else if (BOOLEAN_FLAGS.has(key)) {
      flags[key] = true
    } else {
      const next = argv[index + 1]

      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        index += 1
      } else {
        flags[key] = true
      }
    }
  }

  return { flags, positional }
}

// MARK: Output

function print(value) {
  console.log(JSON.stringify(value, null, 2))
}

// MARK: Input

async function readInput(argument) {
  if (argument && argument !== '-') {
    return readFileSync(path.resolve(argument), 'utf8')
  }

  if (process.stdin.isTTY) {
    throw new Error(
      'Pass a JSON file, "-" plus piped stdin, or --one "<json>".',
    )
  }

  let data = ''

  for await (const chunk of process.stdin) data += chunk

  return data
}

function parseJson(text, label) {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`)
  }
}

// MARK: Session

async function ready(flags) {
  const appRoot = resolveAppRoot()
  const workspaceRoot = resolveProjectRoot()
  const url = workspaceUrl(workspaceRoot)
  const server = await ensureDevServer(appRoot)
  const { client, browser } = await connectToApp({
    url,
    headless: Boolean(flags.headless),
  })

  await waitForBridge(client)

  let state = await call(client, 'getState()')

  // A page can be navigated by hand; re-target it before changing anything.
  if (state.workspaceRoot !== workspaceRoot) {
    await navigate(client, url)
    await waitForBridge(client)
    state = await call(client, 'getState()')
  }

  return { appRoot, workspaceRoot, url, server, browser, client, state }
}

const call = (client, expression) =>
  client.evaluate(`window.__EXCALIDRAW_AGENT__.${expression}`)

// MARK: Canvas waits

async function waitForTab(client, filePath) {
  await waitFor(
    () =>
      client.evaluate(
        `window.__EXCALIDRAW_AGENT__.getState().tabs.some((tab) => tab.filePath === ${JSON.stringify(filePath)})`,
        { awaitPromise: false },
      ),
    { timeoutMs: 20000, intervalMs: 150, label: `the tab for ${filePath}` },
  )
}

/** Waits for the Excalidraw canvas to finish mounting when a tab is open. */
async function waitForCanvas(client) {
  const state = await call(client, 'getState()')

  if (!state.activeTabId) return

  await waitFor(
    async () => {
      const next = await call(client, 'getState()')

      return next.ready === true
    },
    { timeoutMs: 30000, intervalMs: 150, label: 'the Excalidraw canvas' },
  )
}

// MARK: Snapshots

function snapshotDirectory(workspaceRoot, filePath, fallback) {
  const key = filePath ?? fallback ?? 'untitled'
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 12)

  return path.join(workspaceStateDir(workspaceRoot), 'snapshots', hash)
}

function safeSnapshotName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-')
}

// MARK: Commands

async function main() {
  const argv = process.argv.slice(2)
  const { flags, positional } = parseArgs(argv)
  const command = positional.shift() ?? 'help'

  if (command === 'help' || flags.help) {
    console.log(USAGE)
    return
  }

  // MARK: Status

  if (command === 'status') {
    let appRoot = null
    let workspaceRoot = null
    let url = BASE_URL

    try {
      appRoot = resolveAppRoot()
    } catch {
      appRoot = null
    }

    try {
      workspaceRoot = resolveProjectRoot()
      url = workspaceUrl(workspaceRoot)
    } catch {
      workspaceRoot = null
    }

    const health = await appHealth()
    const cdp = await cdpStatus()
    let bridge = null
    let pages = []

    if (cdp) {
      pages = await listAppPages(url).catch(() => [])

      try {
        const target = await findPageTarget(url)

        if (target) {
          const client = await openCdp(target.webSocketDebuggerUrl)
          bridge = await client.evaluate(
            'window.__EXCALIDRAW_AGENT__ ? window.__EXCALIDRAW_AGENT__.getState() : null',
          )
          client.close()
        }
      } catch (error) {
        bridge = { error: error.message }
      }
    }

    print({
      appRoot,
      workspaceRoot,
      appUrl: url,
      pages: pages.map((page) => page.url),
      devServer: health ? 'up' : 'down',
      devServerHealth: health,
      log: devServerLogPath(),
      logTail: health ? undefined : readLogTail(12) || undefined,
      debugBrowser: cdp ? (cdp.Browser ?? 'up') : 'down',
      bridge,
    })
    return
  }

  // MARK: Lifecycle

  if (command === 'close') {
    const url = workspaceUrl(resolveProjectRoot())

    print(
      await closePage(url).catch((error) => ({
        closed: false,
        reason: error.message,
      })),
    )
    return
  }

  if (command === 'stop') {
    const workspaceRoot = resolveProjectRoot()
    const url = workspaceUrl(workspaceRoot)
    const closed = await closePage(url).catch(() => ({ closed: false }))

    // Give CDP a moment to drop the closed target before counting pages.
    await sleep(250)

    const remaining = await listAppPages(url).catch(() => [])

    if (flags.all || remaining.length === 0) {
      print({
        closed,
        browser: await stopBrowser(),
        devServer: await stopDevServer(),
      })
    } else {
      print({ closed, remainingWorkspaces: remaining.length })
    }

    return
  }

  // MARK: Read

  if (command === 'open') {
    const [file] = positional

    if (!file) throw new Error('open needs a drawing path.')

    const filePath = path.resolve(file)
    const { client, appRoot, workspaceRoot } = await ready(flags)

    const opened = await call(client, `open(${JSON.stringify(filePath)})`)

    if (!opened?.tabId) {
      throw new Error(
        `Could not open ${filePath}. Check that it exists and is a valid .excalidraw file.`,
      )
    }

    await waitForTab(client, filePath)
    await waitForCanvas(client)

    const state = await call(client, 'getState()')
    const tab = state.tabs.find((candidate) => candidate.filePath === filePath)

    print({ appRoot, workspaceRoot, filePath, tab })
    return
  }

  if (command === 'describe') {
    const { client } = await ready(flags)
    const result = await call(client, 'describe()')

    if (flags.json) {
      print(result)
    } else {
      console.log(`File: ${result.filePath ?? result.name ?? 'untitled'}`)
      console.log(result.text)
    }

    return
  }

  if (command === 'elements' || command === 'scene') {
    const { client } = await ready(flags)

    print(await call(client, 'getScene()'))
    return
  }

  // MARK: Write

  if (command === 'add') {
    const text = flags.one ?? (await readInput(positional[0]))
    const elements = parseJson(text, 'Elements')
    const { client } = await ready(flags)

    print(
      await call(
        client,
        `add(${JSON.stringify(elements)}, ${JSON.stringify({
          scroll: Boolean(flags.scroll),
        })})`,
      ),
    )
    return
  }

  if (command === 'apply') {
    const text = await readInput(positional[0])
    const patch = parseJson(text, 'Patch')
    const { client } = await ready(flags)

    print(await call(client, `apply(${JSON.stringify(patch)})`))
    return
  }

  if (command === 'update') {
    const [id] = positional

    if (!id) throw new Error('update needs an element id.')
    if (!flags.set) throw new Error('update needs --set "<json>".')

    const set = parseJson(flags.set, '--set')
    const { client } = await ready(flags)

    print(
      await call(
        client,
        `update(${JSON.stringify(id)}, ${JSON.stringify(set)})`,
      ),
    )
    return
  }

  if (command === 'delete') {
    if (positional.length === 0)
      throw new Error('delete needs one or more ids.')

    const { client } = await ready(flags)

    print(await call(client, `deleteElements(${JSON.stringify(positional)})`))
    return
  }

  if (command === 'clear') {
    if (!flags.yes) {
      throw new Error('clear erases the whole drawing; pass --yes to confirm.')
    }

    const { client } = await ready(flags)

    print(await call(client, 'clear()'))
    return
  }

  if (command === 'save') {
    const { client } = await ready(flags)

    print(await call(client, 'save()'))
    return
  }

  // MARK: Look

  if (command === 'screenshot') {
    const { client, workspaceRoot } = await ready(flags)

    let clip

    if (flags.canvas) {
      clip = await client.evaluate(`(() => {
        const element =
          document.querySelector('.excalidraw__canvas') ??
          document.querySelector('.excalidraw')
        if (!element) return null
        const rect = element.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) return null
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 }
      })()`)

      if (!clip)
        throw new Error('Could not find the Excalidraw canvas to crop.')
    } else if (flags.full) {
      const metrics = await client.send('Page.getLayoutMetrics')
      const size = metrics.cssContentSize ?? metrics.contentSize
      clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 }
    }

    // Let the canvas paint the latest programmatic update before capturing.
    await sleep(350)

    const { data } = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: Boolean(flags.full),
      ...(clip ? { clip } : {}),
    })

    const output = flags.out
      ? path.resolve(flags.out)
      : path.join(
          workspaceStateDir(workspaceRoot),
          'screenshots',
          `excalidraw-${Date.now()}.png`,
        )

    mkdirSync(path.dirname(output), { recursive: true })

    const bytes = Buffer.from(data, 'base64')
    writeFileSync(output, bytes)

    print({
      path: output,
      bytes: bytes.length,
      canvasOnly: Boolean(flags.canvas),
    })
    return
  }

  if (command === 'viewport') {
    const { client } = await ready(flags)
    const ids = flags.ids
      ? String(flags.ids)
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined

    await call(
      client,
      `setViewport(${JSON.stringify({
        fit: Boolean(flags.fit),
        ids,
        zoom: flags.zoom === undefined ? undefined : Number(flags.zoom),
        animate: !flags['no-animate'],
      })})`,
    )

    print({ ok: true })
    return
  }

  // MARK: Safety

  if (command === 'snapshot') {
    const [action, rawName] = positional
    const { client, workspaceRoot } = await ready(flags)
    const state = await call(client, 'getState()')
    const active = state.tabs.find((tab) => tab.active) ?? null
    const directory = snapshotDirectory(
      workspaceRoot,
      active?.filePath,
      active?.id,
    )

    if (action === 'save') {
      if (!rawName) throw new Error('snapshot save needs a name.')

      const name = safeSnapshotName(rawName)
      const scene = await call(client, 'getScene()')
      const file = path.join(directory, `${name}.json`)

      mkdirSync(directory, { recursive: true })
      writeFileSync(
        file,
        `${JSON.stringify({ version: 1, savedAt: new Date().toISOString(), tab: active, scene }, null, 2)}\n`,
      )

      print({ saved: file, elements: scene.elements.length })
      return
    }

    if (action === 'list') {
      let entries = []

      try {
        entries = readdirSync(directory).filter((entry) =>
          entry.endsWith('.json'),
        )
      } catch {
        entries = []
      }

      const snapshots = entries.map((entry) => {
        const file = path.join(directory, entry)
        let savedAt = null

        try {
          savedAt = JSON.parse(readFileSync(file, 'utf8')).savedAt ?? null
        } catch {
          savedAt = null
        }

        return {
          name: entry.replace(/\.json$/, ''),
          savedAt,
          path: file,
        }
      })

      print({ directory, snapshots })
      return
    }

    if (action === 'restore') {
      if (!rawName) throw new Error('snapshot restore needs a name.')

      const name = safeSnapshotName(rawName)
      const file = path.join(directory, `${name}.json`)
      const snapshot = parseJson(readFileSync(file, 'utf8'), 'Snapshot')

      print(await call(client, `restore(${JSON.stringify(snapshot.scene)})`))
      return
    }

    throw new Error('snapshot needs save, list or restore.')
  }

  throw new Error(`Unknown command "${command}". Run with --help.`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`error: ${error.message}`)
    process.exit(1)
  })
