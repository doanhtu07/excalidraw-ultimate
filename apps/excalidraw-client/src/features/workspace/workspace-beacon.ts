import { AGENT_FILE_ENDPOINT } from './files/agent-client'

/** Best-effort write that survives a page unload. */
export function beaconWrite(path: string, text: string): void {
  const body = new Blob([JSON.stringify({ path, text })], {
    type: 'application/json',
  })

  navigator.sendBeacon(`${AGENT_FILE_ENDPOINT}/file`, body)
}
