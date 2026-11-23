import {
  deleteAgentFile,
  readAgentTextFile,
  writeAgentFile,
} from './files/agent-client'
import { loadDrawingScene, serializeDrawingScene } from './files/scene'
import { recoveryPath } from './workspace-layout'
import type { DrawingScene } from './files/scene'

export { recoveryFileName, recoveryRelativePath } from './recovery-name'

export async function readRecoveryScene(
  stateDir: string,
  recovery: string,
): Promise<DrawingScene | null> {
  try {
    const text = await readAgentTextFile(recoveryPath(stateDir, recovery))
    const fileName = recovery.split('/').pop() ?? 'recovery.excalidraw'
    const file = new File([text], fileName, { type: 'application/json' })

    return await loadDrawingScene(file)
  } catch {
    return null
  }
}

/** Writes a recovery scene and returns the serialized JSON it wrote. */
export async function writeRecoveryScene(
  stateDir: string,
  recovery: string,
  scene: DrawingScene,
): Promise<string> {
  const json = await serializeDrawingScene(scene)

  await writeAgentFile(recoveryPath(stateDir, recovery), json)

  return json
}

export async function removeRecovery(
  stateDir: string,
  recovery: string,
): Promise<void> {
  await deleteAgentFile(recoveryPath(stateDir, recovery))
}
