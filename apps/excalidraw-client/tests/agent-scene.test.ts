import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatSceneSummary,
  normalizeAgentElements,
  routeBoundArrow,
  summarizeElements,
} from '../src/features/workspace/agent/agent-scene.ts'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

function element(overrides: Record<string, unknown>): ExcalidrawElement {
  return {
    id: 'element',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    version: 1,
    ...overrides,
  } as unknown as ExcalidrawElement
}

void test('summarizeElements resolves bound labels onto their container', () => {
  const summary = summarizeElements([
    element({ id: 'svc', type: 'rectangle' }),
    element({
      id: 'svc-label',
      type: 'text',
      text: 'API',
      containerId: 'svc',
    }),
  ])

  assert.equal(summary.count, 2)
  assert.deepEqual(summary.byType, { rectangle: 1, text: 1 })
  assert.equal(summary.elements[0].text, 'API')
  assert.equal(summary.elements[1].containerId, 'svc')
})

void test('summarizeElements keeps arrow bindings and free text', () => {
  const summary = summarizeElements([
    element({ id: 'a' }),
    element({
      id: 'edge',
      type: 'arrow',
      startBinding: { elementId: 'a', focus: 0, gap: 0 },
      endBinding: { elementId: 'b', focus: 0, gap: 0 },
    }),
    element({ id: 'note', type: 'text', text: 'free note' }),
  ])

  assert.equal(summary.elements[1].start, 'a')
  assert.equal(summary.elements[1].end, 'b')
  assert.equal(summary.elements[2].text, 'free note')
})

void test('formatSceneSummary prints ids, bounds, labels and bindings', () => {
  const text = formatSceneSummary(
    summarizeElements([
      element({ id: 'api', type: 'rectangle', x: 10, y: 20 }),
      element({
        id: 'api-label',
        type: 'text',
        text: 'API',
        containerId: 'api',
      }),
      element({
        id: 'edge',
        type: 'arrow',
        startBinding: { elementId: 'api', focus: 0, gap: 0 },
        endBinding: { elementId: 'db', focus: 0, gap: 0 },
      }),
    ]),
  )

  assert.match(text, /^3 elements/)
  assert.match(text, /- api \[rectangle\] 10,20 100x60 "API"/)
  assert.match(text, /api -> db/)
})

void test('normalizeAgentElements maps the agent-friendly format', () => {
  const [shape, arrow, text] = normalizeAgentElements([
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      text: 'API',
      fontFamily: 'excalifont',
    },
    {
      type: 'arrow',
      x: 0,
      y: 0,
      startElementId: 'a',
      endElementId: 'b',
      points: [
        [0, 0],
        [100, 0],
      ],
    },
    { type: 'text', x: 0, y: 0, text: 'free' },
  ]) as Array<Record<string, unknown>>

  assert.deepEqual(shape.label, { text: 'API' })
  assert.equal(shape.fontFamily, 5)
  assert.equal(shape.text, undefined)
  assert.deepEqual(arrow.start, { id: 'a' })
  assert.deepEqual(arrow.end, { id: 'b' })
  assert.deepEqual(arrow.points, [
    [0, 0],
    [100, 0],
  ])
  assert.equal(text.text, 'free')
})

void test('normalizeAgentElements rejects a non-array payload', () => {
  assert.throws(() => normalizeAgentElements({ type: 'rectangle' }), /array/)
})

void test('routeBoundArrow connects the facing edges of its endpoints', () => {
  const start = element({ id: 'api', x: 0, y: 0, width: 100, height: 50 })
  const end = element({ id: 'db', x: 0, y: 200, width: 100, height: 50 })
  const arrow = element({
    type: 'arrow',
    startBinding: { elementId: 'api', focus: 0, gap: 0 },
    endBinding: { elementId: 'db', focus: 0, gap: 0 },
  })

  const route = routeBoundArrow(arrow, [start, end, arrow])

  assert.ok(route)
  assert.deepEqual(
    { x: route.x, y: route.y, width: route.width, height: route.height },
    { x: 50, y: 50, width: 0, height: 150 },
  )
  assert.deepEqual(route.points, [
    [0, 0],
    [0, 150],
  ])
  assert.deepEqual(route.label, { x: 50, y: 125 })
})

void test('routeBoundArrow returns null when a side is missing', () => {
  const start = element({ id: 'api' })
  const arrow = element({
    type: 'arrow',
    startBinding: { elementId: 'api', focus: 0, gap: 0 },
  })

  assert.equal(routeBoundArrow(arrow, [start, arrow]), null)
})
