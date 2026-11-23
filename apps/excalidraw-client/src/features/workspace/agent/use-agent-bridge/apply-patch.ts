import { routeBoundArrow } from '../agent-scene'
import { createElementsFromSkeletons } from './create-elements'
import { applyUpdate, bumpElement, isRecord } from './scene-helpers'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AgentMutationResult, AgentPatch } from '../agent-types'
import type { BridgeContext } from './bridge-types'

/**
 * Applies a `{ create, update, delete }` patch in one scene update, so agents
 * never see a half-applied mutation.
 */
export async function applyPatch(
  { api }: BridgeContext,
  patch: AgentPatch,
): Promise<AgentMutationResult> {
  const instance = api()
  const created = patch.create?.length
    ? await createElementsFromSkeletons(patch.create)
    : []
  let elements: Array<ExcalidrawElement> = [
    ...instance.getSceneElements(),
    ...created,
  ]

  // Skeleton arrows with bindings are created at 0,0; route them between
  // the edges of the elements they bind to before the scene is applied.
  for (const element of created) {
    const route = routeBoundArrow(element, elements)

    if (!route) continue

    Object.assign(element, {
      x: route.x,
      y: route.y,
      width: route.width,
      height: route.height,
      points: route.points,
    })

    const label = elements.find(
      (candidate) =>
        candidate.type === 'text' && candidate.containerId === element.id,
    )

    if (label) {
      Object.assign(label, {
        x: route.label.x - label.width / 2,
        y: route.label.y - label.height / 2,
      })
    }
  }

  const warnings: Array<string> = []
  const updated: Array<string> = []

  for (const entry of patch.update ?? []) {
    if (!isRecord(entry) || typeof entry.id !== 'string') {
      throw new Error('Every update needs a string "id".')
    }

    const index = elements.findIndex((element) => element.id === entry.id)

    if (index === -1) {
      throw new Error(`No element with id "${entry.id}".`)
    }

    const set = isRecord(entry.set) ? { ...entry.set } : { ...entry }
    delete set.id

    elements = applyUpdate(elements, index, set, warnings)
    updated.push(entry.id)
  }

  const deleted: Array<string> = []

  if (patch.delete?.length) {
    const ids = new Set(patch.delete.filter((id) => typeof id === 'string'))

    if (ids.size > 0) {
      elements = elements.map((element) => {
        const isBoundLabel =
          element.type === 'text' &&
          element.containerId !== null &&
          ids.has(element.containerId)

        if (!ids.has(element.id) && !isBoundLabel) return element

        if (!element.isDeleted) deleted.push(element.id)

        return bumpElement(element, { isDeleted: true })
      })
    }
  }

  instance.updateScene({
    elements,
    captureUpdate: 'IMMEDIATELY',
  })

  return {
    created: created.map((element) => element.id),
    updated,
    deleted,
    warnings,
  }
}
