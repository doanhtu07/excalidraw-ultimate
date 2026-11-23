const CHANNEL_NAME = 'excalidraw-ultimate-workspaces'
const FOCUS_TIMEOUT_MS = 350

interface FocusMessage {
  type: 'focus'
  root: string
  id: string
}

interface FocusedMessage {
  type: 'focused'
  root: string
  id: string
}

function readMessage(value: unknown): {
  type?: string
  root?: string
  id?: string
} | null {
  return typeof value === 'object' && value !== null ? value : null
}

/** Answers focus requests for this workspace from other app windows. */
export function listenForWorkspaceFocus(root: string): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}

  const channel = new BroadcastChannel(CHANNEL_NAME)

  channel.onmessage = (event: MessageEvent<unknown>) => {
    const message = readMessage(event.data)

    if (
      message?.type !== 'focus' ||
      message.root !== root ||
      typeof message.id !== 'string'
    ) {
      return
    }

    window.focus()
    channel.postMessage({
      type: 'focused',
      root,
      id: message.id,
    } satisfies FocusedMessage)
  }

  return () => channel.close()
}

/**
 * Asks an already-open window for this workspace to focus itself.
 *
 * Resolves `false` when no page answered, in which case the caller should open
 * a new window. The short wait stays inside the click's user activation, so
 * `window.open` still works when needed.
 */
export function requestWorkspaceFocus(root: string): Promise<boolean> {
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve(false)

  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`

    const finish = (focused: boolean) => {
      clearTimeout(timer)
      channel.close()
      resolve(focused)
    }

    const timer = setTimeout(() => finish(false), FOCUS_TIMEOUT_MS)

    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = readMessage(event.data)

      if (message?.type === 'focused' && message.id === id) finish(true)
    }

    channel.postMessage({ type: 'focus', root, id } satisfies FocusMessage)
  })
}
