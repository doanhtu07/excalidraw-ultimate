import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  BASE_URL,
  browserPidPath,
  browserProfilePath,
  CDP_PORT,
  CDP_URL,
  ensureStateDir,
  setting,
} from './config.mjs'
import { fetchJson, waitFor } from './http.mjs'

/**
 * A headed Chrome instance with the DevTools Protocol enabled. It is the
 * agent's eyes: the same window a human can watch, screenshot-able over CDP
 * without a puppeteer/playwright dependency (Node 22+ ships WebSocket).
 */

// MARK: Browser candidates

const MAC_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]

/** Where browser installs live: machine-wide, then the per-user profile. */
const WINDOWS_ROOTS = [
  'PROGRAMW6432',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'LOCALAPPDATA',
]

/** Install directories relative to each Windows root, in preference order. */
const WINDOWS_CANDIDATES = [
  ['Google', 'Chrome', 'Application', 'chrome.exe'],
  ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'],
  ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
  ['Chromium', 'Application', 'chrome.exe'],
]

const LINUX_NAMES = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'brave-browser',
  'microsoft-edge',
]

// MARK: Browser discovery

function fromPath(name) {
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', ''] : ['']

  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${name}${extension}`)

      if (existsSync(candidate)) return candidate
    }
  }

  return null
}

export function findBrowserBinary() {
  const configured = setting('EXCALIDRAW_ULTIMATE_BROWSER', 'browser')

  if (configured) {
    return configured
  }

  if (process.platform === 'darwin') {
    const found = MAC_CANDIDATES.find((candidate) => existsSync(candidate))

    if (found) return found
  }

  if (process.platform === 'win32') {
    const roots = WINDOWS_ROOTS.map((name) => process.env[name]).filter(Boolean)

    // Prefer the browser over the install location: a per-user Chrome wins
    // over the machine-wide Edge that every Windows install ships.
    for (const relative of WINDOWS_CANDIDATES) {
      for (const root of roots) {
        const candidate = path.join(root, ...relative)

        if (existsSync(candidate)) return candidate
      }
    }
  }

  for (const name of LINUX_NAMES) {
    const found = fromPath(name)

    if (found) return found
  }

  throw new Error(
    [
      'No Chrome/Chromium/Brave/Edge binary found.',
      'Install one, or point the skill at it:',
      '  EXCALIDRAW_ULTIMATE_BROWSER="/path/to/chrome"',
    ].join('\n'),
  )
}

// MARK: DevTools endpoint

export async function cdpStatus() {
  try {
    const response = await fetchJson(`${CDP_URL}/json/version`, {}, 900)

    return response.ok ? response.body : null
  } catch {
    return null
  }
}

// MARK: Pages

async function listPages() {
  const response = await fetchJson(`${CDP_URL}/json/list`, {}, 3000)

  if (!response.ok || !Array.isArray(response.body)) {
    throw new Error(`Could not list browser pages (HTTP ${response.status}).`)
  }

  return response.body.filter((target) => target.type === 'page')
}

function matchesWorkspace(pageUrl, wantedUrl) {
  try {
    const page = new URL(pageUrl)
    const wanted = new URL(wantedUrl)

    return (
      page.origin === wanted.origin &&
      page.pathname === wanted.pathname &&
      page.searchParams.get('workspace') ===
        wanted.searchParams.get('workspace')
    )
  } catch {
    return false
  }
}

export async function findPageTarget(url = BASE_URL) {
  const pages = await listPages()

  return pages.find((page) => matchesWorkspace(page.url, url)) ?? null
}

/** Pages that belong to this app, in any workspace. */
export async function listAppPages(url = BASE_URL) {
  const pages = await listPages()
  const wanted = new URL(url)

  return pages.filter((page) => {
    try {
      const candidate = new URL(page.url)

      return (
        candidate.origin === wanted.origin &&
        candidate.pathname === wanted.pathname
      )
    } catch {
      return false
    }
  })
}

/** Closes the app page for one workspace, if it is open. */
export async function closePage(url = BASE_URL) {
  const target = await findPageTarget(url)

  if (!target) return { closed: false, reason: 'not open' }

  const response = await fetchJson(
    `${CDP_URL}/json/close/${target.id}`,
    {},
    3000,
  ).catch(() => null)

  return {
    closed: Boolean(response?.ok),
    targetId: target.id,
  }
}

async function createPage(url) {
  let response = await fetchJson(
    `${CDP_URL}/json/new?${encodeURIComponent(url)}`,
    { method: 'PUT' },
    5000,
  )

  if (!response.ok) {
    // Older Chrome versions accept GET.
    response = await fetchJson(
      `${CDP_URL}/json/new?${encodeURIComponent(url)}`,
      {},
      5000,
    )
  }

  if (!response.ok || !response.body?.webSocketDebuggerUrl) {
    throw new Error(
      `Could not open a browser page: ${response.status} ${String(response.body)}`,
    )
  }

  return response.body
}

async function ensurePage(url) {
  const existing = await findPageTarget(url)

  if (existing) return existing

  return createPage(url)
}

// MARK: Debug browser

/** Launches the debug browser unless a DevTools endpoint is already live. */
export async function ensureDebugBrowser({
  url = BASE_URL,
  headless = false,
} = {}) {
  const existing = await cdpStatus()

  if (existing) {
    await ensurePage(url)

    return {
      started: false,
      reused: true,
      browser: existing.Browser,
      port: CDP_PORT,
    }
  }

  const binary = findBrowserBinary()
  ensureStateDir()
  const profile = browserProfilePath()

  mkdirSync(profile, { recursive: true })

  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--window-size=1440,900',
    ...(headless ? ['--headless=new', '--disable-gpu'] : []),
    url,
  ]

  const child = spawn(binary, args, {
    detached: true,
    stdio: 'ignore',
  })

  await new Promise((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })

  child.unref()
  writeFileSync(browserPidPath(), `${child.pid}\n`)

  await waitFor(() => cdpStatus(), {
    timeoutMs: 20000,
    intervalMs: 200,
    label: 'the Chrome DevTools endpoint',
  })

  await ensurePage(url)

  return {
    started: true,
    reused: false,
    pid: child.pid,
    binary,
    port: CDP_PORT,
  }
}

// MARK: CDP client

/** Opens a CDP WebSocket to a page target and returns a small command client. */
export async function openCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl)
  const pending = new Map()
  let nextId = 1

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener(
      'error',
      () => reject(new Error('CDP socket failed')),
      {
        once: true,
      },
    )
  })

  socket.addEventListener('message', (event) => {
    let message

    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }

    const request = pending.get(message.id)

    if (!request) return

    pending.delete(message.id)
    clearTimeout(request.timeout)

    if (message.error) {
      request.reject(
        new Error(`${message.error.message} (${message.error.code})`),
      )
    } else {
      request.resolve(message.result)
    }
  })

  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout)
      request.reject(new Error('CDP connection closed.'))
    }

    pending.clear()
  })

  const send = (method, params = {}, timeoutMs = 30000) =>
    new Promise((resolve, reject) => {
      const id = nextId++

      const timeout = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms.`))
      }, timeoutMs)

      pending.set(id, { resolve, reject, timeout })
      socket.send(JSON.stringify({ id, method, params }))
    })

  const evaluate = async (expression, { awaitPromise = true } = {}) => {
    const response = await send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    })

    if (response.exceptionDetails) {
      const details = response.exceptionDetails

      const description =
        details.exception?.description ??
        details.exception?.value ??
        details.text ??
        'unknown error'

      throw new Error(`Page evaluation failed: ${description}`)
    }

    return response.result?.value
  }

  return {
    send,
    evaluate,
    close: () => socket.close(),
  }
}

// MARK: App session

/** Connects to (or creates) the app page in the debug browser. */
export async function connectToApp({ url = BASE_URL, headless = false } = {}) {
  const browser = await ensureDebugBrowser({ url, headless })
  const target = await ensurePage(url)
  const client = await openCdp(target.webSocketDebuggerUrl)

  await client.send('Page.enable').catch(() => {})
  await client.send('Runtime.enable').catch(() => {})

  return { browser, target, client }
}

export async function waitForBridge(client, timeoutMs = 60000) {
  await waitFor(() => client.evaluate('Boolean(window.__EXCALIDRAW_AGENT__)'), {
    timeoutMs,
    intervalMs: 200,
    label: 'the Excalidraw agent bridge',
  })
}

/** Navigates the app page, reloading it without restarting the browser. */
export async function navigate(client, url) {
  await client.send('Page.navigate', { url })
}

// MARK: Lifecycle

/** Closes the debug browser (only the instance we launched). */
export async function stopBrowser() {
  const version = await cdpStatus()

  if (!version) {
    rmSync(browserPidPath(), { force: true })
    return { stopped: false, reason: 'not running' }
  }

  try {
    const client = await openCdp(version.webSocketDebuggerUrl)
    await client.send('Browser.close').catch(() => {})
    client.close()
  } catch {
    rmSync(browserPidPath(), { force: true })
    return { stopped: false, reason: 'could not connect' }
  }

  rmSync(browserPidPath(), { force: true })

  await waitFor(async () => (await cdpStatus()) === null, {
    timeoutMs: 5000,
    intervalMs: 150,
    label: 'the browser to close',
  }).catch(() => {})

  return { stopped: true }
}
