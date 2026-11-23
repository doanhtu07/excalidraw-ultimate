import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  hasFileChanged,
  hashScene,
  stripDrawingExtension,
} from '../src/features/workspace/files/scene.ts'
import { recoveryFileName } from '../src/features/workspace/recovery-name.ts'
import { parseWorkspaceLayout } from '../src/features/workspace/workspace-layout-parse.ts'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

const element = (version: number) =>
  ({ id: String(version), version }) as unknown as ExcalidrawElement

// MARK: Scene helpers

void test('hashScene changes whenever an element version changes', () => {
  const hash = hashScene([element(1), element(2)])

  assert.equal(hash, hashScene([element(1), element(2)]))
  assert.notEqual(hash, hashScene([element(1), element(3)]))
  assert.notEqual(hash, hashScene([element(1)]))
  assert.equal(hashScene([]), hashScene([]))
})

void test('stripDrawingExtension removes only the drawing extension', () => {
  assert.equal(stripDrawingExtension('plan.excalidraw'), 'plan')
  assert.equal(stripDrawingExtension('plan.txt'), 'plan.txt')
  assert.equal(stripDrawingExtension('.excalidraw'), '')
})

void test('hasFileChanged is false only for an identical stat', () => {
  const stat = { lastModified: 1000, size: 42 }

  assert.equal(hasFileChanged(undefined, stat), true)
  assert.equal(hasFileChanged(stat, { ...stat }), false)
  assert.equal(hasFileChanged(stat, { lastModified: 1001, size: 42 }), true)
  assert.equal(hasFileChanged(stat, { lastModified: 1000, size: 43 }), true)
})

// MARK: Workspace layout

void test('parseWorkspaceLayout accepts a valid version 1 layout', () => {
  const layout = parseWorkspaceLayout(
    JSON.stringify({
      version: 1,
      root: '/repo',
      name: 'repo',
      activeTabId: 'a',
      updatedAt: 'now',
      tabs: [],
    }),
  )

  assert.equal(layout?.root, '/repo')
})

void test('parseWorkspaceLayout rejects corrupt or unknown versions', () => {
  assert.equal(parseWorkspaceLayout('not json'), null)
  assert.equal(
    parseWorkspaceLayout(JSON.stringify({ version: 2, tabs: [] })),
    null,
  )
  assert.equal(parseWorkspaceLayout(JSON.stringify({ version: 1 })), null)
})

void test('recoveryFileName is readable and stable per tab', () => {
  assert.equal(
    recoveryFileName('tab-1', 'Architecture'),
    'Architecture--tab1.excalidraw',
  )
  assert.equal(
    recoveryFileName('aaaaaaaa-bbbb', 'My Drawing'),
    'My-Drawing--aaaaaaaa.excalidraw',
  )
})
