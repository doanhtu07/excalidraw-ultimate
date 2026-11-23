import { spawn } from 'node:child_process'
import {
  closeSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {
  AGENT_HEALTH_URL,
  BASE_URL,
  devServerLogPath,
  devServerPidPath,
  ensureStateDir,
} from './config.mjs'
import { fetchJson, waitFor } from './http.mjs'

/** True when our Vite app (not just any server on port 3000) is listening. */
export async function appHealth(timeoutMs = 1200) {
  try {
    const response = await fetchJson(AGENT_HEALTH_URL, {}, timeoutMs)

    return response.ok ? response.body : null
  } catch {
    return null
  }
}

async function portResponds() {
  try {
    const response = await fetchJson(`${BASE_URL}/`, {}, 1200)

    return response.status
  } catch {
    return null
  }
}

export function readLogTail(lines = 40) {
  try {
    return readFileSync(devServerLogPath(), 'utf8')
      .split('\n')
      .slice(-lines)
      .join('\n')
  } catch {
    return ''
  }
}

/**
 * Starts `pnpm --filter @apps/excalidraw-client dev` detached if the app is not
 * already up. The dev server is the only "backend" the skill needs: the agent
 * bridge lives in the page and the file endpoints are a Vite middleware.
 */
export async function ensureDevServer(appRoot) {
  const running = await appHealth()

  if (running) return { started: false, health: running }

  const status = await portResponds()

  if (status !== null) {
    throw new Error(
      [
        `${BASE_URL} is already in use, but it is not the Excalidraw Ultimate app`,
        '(missing /__excalidraw/agent/health). Stop that process or run the app',
        `on another port and set EXCALIDRAW_ULTIMATE_URL.`,
      ].join(' '),
    )
  }

  ensureStateDir()

  const log = openSync(devServerLogPath(), 'a')
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const child = spawn(pnpm, ['--filter', '@apps/excalidraw-client', 'dev'], {
    cwd: appRoot,
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, FORCE_COLOR: '0' },
  })

  await new Promise((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })

  child.unref()
  closeSync(log)
  writeFileSync(devServerPidPath(), `${child.pid}\n`)

  try {
    await waitFor(appHealth, {
      timeoutMs: 90000,
      intervalMs: 300,
      label: 'the Excalidraw dev server',
    })
  } catch (error) {
    const tail = readLogTail()

    throw new Error(
      `${error.message}\n\nLast dev-server log lines (${devServerLogPath()}):\n${tail}`,
    )
  }

  return { started: true, pid: child.pid, log: devServerLogPath() }
}

/** Stops a dev server started by this skill (never a manually started one). */
export async function stopDevServer() {
  let pid

  try {
    pid = Number(readFileSync(devServerPidPath(), 'utf8').trim())
  } catch {
    return { stopped: false, reason: 'not started by the skill' }
  }

  if (!Number.isFinite(pid) || pid <= 0) {
    rmSync(devServerPidPath(), { force: true })
    return { stopped: false, reason: 'invalid pid' }
  }

  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
      })
    } else {
      process.kill(-pid, 'SIGTERM')
    }
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      rmSync(devServerPidPath(), { force: true })
      return { stopped: false, reason: 'process is gone' }
    }
  }

  rmSync(devServerPidPath(), { force: true })

  await waitFor(async () => (await appHealth(500)) === null, {
    timeoutMs: 8000,
    intervalMs: 200,
    label: 'the dev server to stop',
  }).catch(() => {})

  return { stopped: true, pid }
}
