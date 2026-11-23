import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createTabId,
  createUntitledName,
  reorderTabs,
} from '../src/features/workspace/editor-tabs.ts'
import type { EditorTab } from '../src/features/workspace/editor-tabs.ts'

const tab = (name: string): EditorTab => ({
  id: name,
  name,
  dirty: false,
  fileName: null,
  filePath: null,
  revision: 0,
})

void test('createUntitledName starts at Untitled-1', () => {
  assert.equal(createUntitledName([]), 'Untitled-1')
})

void test('createUntitledName follows the highest existing number', () => {
  assert.equal(
    createUntitledName([tab('Untitled-1'), tab('Untitled-3'), tab('Notes')]),
    'Untitled-4',
  )
})

void test('createUntitledName ignores names that only look similar', () => {
  assert.equal(
    createUntitledName([tab('Untitled'), tab('Untitled-1 copy')]),
    'Untitled-1',
  )
})

void test('createTabId returns unique ids', () => {
  const ids = new Set(Array.from({ length: 100 }, () => createTabId()))

  assert.equal(ids.size, 100)
  assert.ok([...ids].every((id) => id.length > 0))
})

void test('reorderTabs moves a tab before another one', () => {
  const tabs = [tab('A'), tab('B'), tab('C')]

  assert.deepEqual(
    reorderTabs(tabs, 'A', 'B', 'before').map((item) => item.name),
    ['A', 'B', 'C'],
  )
  assert.deepEqual(
    reorderTabs(tabs, 'C', 'A', 'before').map((item) => item.name),
    ['C', 'A', 'B'],
  )
})

void test('reorderTabs moves a tab after another one', () => {
  const tabs = [tab('A'), tab('B'), tab('C')]

  assert.deepEqual(
    reorderTabs(tabs, 'A', 'C', 'after').map((item) => item.name),
    ['B', 'C', 'A'],
  )
  assert.deepEqual(
    reorderTabs(tabs, 'B', 'A', 'after').map((item) => item.name),
    ['A', 'B', 'C'],
  )
})

void test('reorderTabs ignores drops that keep the order', () => {
  const tabs = [tab('A'), tab('B'), tab('C')]

  assert.equal(reorderTabs(tabs, 'B', 'B', 'before'), tabs)
  assert.equal(reorderTabs(tabs, 'B', 'A', 'after'), tabs)
  assert.equal(reorderTabs(tabs, 'B', 'C', 'before'), tabs)
  assert.equal(reorderTabs(tabs, 'missing', 'A', 'before'), tabs)
  assert.equal(reorderTabs(tabs, 'A', 'missing', 'before'), tabs)
})

void test('reorderTabs keeps the tab object identity', () => {
  const tabs = [tab('A'), tab('B'), tab('C')]
  const [moved] = reorderTabs(tabs, 'C', 'A', 'before')

  assert.equal(moved, tabs[2])
})
