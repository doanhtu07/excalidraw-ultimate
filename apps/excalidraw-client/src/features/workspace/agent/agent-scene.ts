import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'

/**
 * Pure helpers behind the agent bridge. They are kept free of Excalidraw
 * runtime imports so they can be unit tested in Node.
 */

// MARK: Types

type UnknownRecord = Record<string, unknown>

export interface AgentElementSummary {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  text?: string
  containerId?: string
  start?: string
  end?: string
  locked?: boolean
}

export interface AgentSceneSummary {
  count: number
  byType: Record<string, number>
  elements: Array<AgentElementSummary>
}

// MARK: Scene summary

/** Summarises a scene for `describe`, resolving bound labels and bindings. */
export function summarizeElements(
  elements: ReadonlyArray<ExcalidrawElement>,
): AgentSceneSummary {
  const labels = new Map<string, string>()

  for (const element of elements) {
    if (element.type === 'text' && element.containerId) {
      labels.set(element.containerId, element.text)
    }
  }

  const byType: Record<string, number> = {}

  const summaries = elements.map((element) => {
    byType[element.type] = (byType[element.type] ?? 0) + 1

    const summary: AgentElementSummary = {
      id: element.id,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    }

    const text =
      labels.get(element.id) ??
      (element.type === 'text' ? element.text : undefined)

    if (text !== undefined) summary.text = text
    if (element.type === 'text' && element.containerId) {
      summary.containerId = element.containerId
    }
    if (element.type === 'arrow' || element.type === 'line') {
      if (element.startBinding?.elementId) {
        summary.start = element.startBinding.elementId
      }
      if (element.endBinding?.elementId) {
        summary.end = element.endBinding.elementId
      }
    }
    if (element.locked) summary.locked = true

    return summary
  })

  return { count: elements.length, byType, elements: summaries }
}

/** Renders a summary as the compact text `describe` prints to agents. */
export function formatSceneSummary(summary: AgentSceneSummary): string {
  const counts = Object.entries(summary.byType)
    .map(([type, count]) => `${count} ${type}${count === 1 ? '' : 's'}`)
    .join(', ')

  const lines = summary.elements.map((element) => {
    const size = `${Math.round(element.width)}x${Math.round(element.height)}`
    const position = `${Math.round(element.x)},${Math.round(element.y)}`
    const label = element.text ? ` "${element.text}"` : ''
    const binding =
      element.start && element.end ? ` ${element.start} -> ${element.end}` : ''
    const locked = element.locked ? ' (locked)' : ''

    return `- ${element.id} [${element.type}] ${position} ${size}${label}${binding}${locked}`
  })

  const header = `${summary.count} element${summary.count === 1 ? '' : 's'}${counts ? ` (${counts})` : ''}`

  return [header, ...lines].join('\n')
}

// MARK: Bound arrows

export interface BoundArrowRoute {
  x: number
  y: number
  width: number
  height: number
  points: Array<[number, number]>
  /** Midpoint of the routed arrow, used to centre a bound label. */
  label: { x: number; y: number }
}

function centerOf(element: ExcalidrawElement) {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  }
}

/** Exits `from` on the side facing `to`, so the line leaves toward its target. */
function anchorPoint(from: ExcalidrawElement, to: ExcalidrawElement) {
  const center = centerOf(from)
  const target = centerOf(to)
  const dx = target.x - center.x
  const dy = target.y - center.y

  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx >= 0 ? from.x + from.width : from.x, y: center.y }
  }

  return { x: center.x, y: dy >= 0 ? from.y + from.height : from.y }
}

/**
 * Computes the geometry for an arrow created with `startElementId` /
 * `endElementId`. Excalidraw's skeleton converter records the bindings but
 * leaves the arrow at x/y 0,0; routing it between the two element edges is
 * what makes the bound arrow actually connect on first render.
 */
export function routeBoundArrow(
  arrow: ExcalidrawElement,
  elements: ReadonlyArray<ExcalidrawElement>,
): BoundArrowRoute | null {
  if (arrow.type !== 'arrow') return null

  const start = elements.find(
    (element) => element.id === arrow.startBinding?.elementId,
  )
  const end = elements.find(
    (element) => element.id === arrow.endBinding?.elementId,
  )

  if (!start || !end) return null

  const startPoint = anchorPoint(start, end)
  const endPoint = anchorPoint(end, start)
  const dx = endPoint.x - startPoint.x
  const dy = endPoint.y - startPoint.y

  return {
    x: startPoint.x,
    y: startPoint.y,
    width: Math.abs(dx),
    height: Math.abs(dy),
    points: [
      [0, 0],
      [dx, dy],
    ],
    label: {
      x: startPoint.x + dx / 2,
      y: startPoint.y + dy / 2,
    },
  }
}

// MARK: Element normalization

const FONT_FAMILIES: Partial<Record<string, number>> = {
  virgil: 1,
  helvetica: 2,
  cascadia: 3,
  'cascadia code': 3,
  excalifont: 5,
  nunito: 6,
  'lilita one': 7,
  'comic shanns': 8,
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Normalises the agent-friendly element format to Excalidraw's skeleton
 * format:
 *
 * - `text` on a shape or arrow becomes a bound `label.text`.
 * - `startElementId` / `endElementId` become `start.id` / `end.id`.
 * - `[[x, y], …]` points become `[{ x, y }, …]`.
 * - font family names (`"excalifont"`) become their numeric value.
 */
export function normalizeAgentElements(
  input: unknown,
): Array<ExcalidrawElementSkeleton> {
  if (!Array.isArray(input)) {
    throw new Error('Elements must be an array of element objects.')
  }

  return input.map((value, index) => {
    if (!isRecord(value)) {
      throw new Error(`Element ${index} must be an object.`)
    }

    const element = structuredClone(value)
    const type = element.type

    if (typeof type !== 'string') {
      throw new Error(`Element ${index} is missing a "type".`)
    }

    if (type !== 'text' && 'text' in element) {
      const text = element.text

      if (typeof text === 'string') {
        const label = isRecord(element.label) ? element.label : {}
        element.label = { ...label, text }
      }

      delete element.text
    }

    if ('startElementId' in element) {
      const id = element.startElementId

      if (typeof id === 'string') {
        element.start = { id }
      }

      delete element.startElementId
    }

    if ('endElementId' in element) {
      const id = element.endElementId

      if (typeof id === 'string') {
        element.end = { id }
      }

      delete element.endElementId
    }

    if (Array.isArray(element.points)) {
      const points = element.points as Array<unknown>

      element.points = points.map((point) => {
        if (Array.isArray(point)) return point

        if (
          isRecord(point) &&
          typeof point.x === 'number' &&
          typeof point.y === 'number'
        ) {
          return [point.x, point.y]
        }

        return point
      })
    }

    if (typeof element.fontFamily === 'string') {
      const fontFamily = FONT_FAMILIES[element.fontFamily.toLowerCase()]

      if (fontFamily !== undefined) element.fontFamily = fontFamily
    }

    return element as ExcalidrawElementSkeleton
  })
}
