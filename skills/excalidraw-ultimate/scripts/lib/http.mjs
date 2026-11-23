export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Fetch JSON (or text) with a hard timeout, without throwing on HTTP errors. */
export async function fetchJson(url, options = {}, timeoutMs = 2000) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  let body = text

  try {
    body = JSON.parse(text)
  } catch {
    // Not JSON; keep the text.
  }

  return { ok: response.ok, status: response.status, body }
}

/** Polls `check` until it returns a truthy value, or throws. */
export async function waitFor(
  check,
  { timeoutMs = 30000, intervalMs = 150, label = 'condition' } = {},
) {
  const deadline = Date.now() + timeoutMs
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const value = await check()

      if (value) return value
    } catch (error) {
      lastError = error
    }

    await sleep(intervalMs)
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`,
  )
}
