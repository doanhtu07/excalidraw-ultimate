import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  canOpenWithFileHandle,
  canSaveWithFileHandle,
  fileStatOf,
  hasFileChanged,
  hashScene,
  isAbortError,
  isMissingFileError,
  pickDrawingFiles,
  saveDrawingFile,
  stripDrawingExtension,
} from '../src/features/workspace/excalidraw-file.ts'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

interface FakeHandle {
  handle: FileSystemFileHandle
  text: () => string
  remove: () => void
}

function makeHandle(name: string, initialText = ''): FakeHandle {
  let text = initialText
  let deleted = false

  const handle = {
    kind: 'file',
    name,
    getFile: () =>
      deleted
        ? Promise.reject(
            new DOMException('The file was removed.', 'NotFoundError'),
          )
        : Promise.resolve(new File([text], name, { type: 'application/json' })),
    createWritable: () =>
      Promise.resolve({
        write: (chunk: string) => {
          text = String(chunk)
          return Promise.resolve()
        },
        close: () => Promise.resolve(),
        abort: () => Promise.resolve(),
      }),
  }

  return {
    handle: handle as unknown as FileSystemFileHandle,
    text: () => text,
    remove: () => {
      deleted = true
    },
  }
}

function setPickers(pickers: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(pickers)) {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    })
  }
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'showSaveFilePicker')
  Reflect.deleteProperty(globalThis, 'showOpenFilePicker')
})

const element = (version: number) =>
  ({ id: String(version), version }) as unknown as ExcalidrawElement

// MARK: Capability detection

void test('capabilities are false without the picker globals', () => {
  assert.equal(canSaveWithFileHandle(), false)
  assert.equal(canOpenWithFileHandle(), false)
})

void test('capabilities are detected per picker method', () => {
  setPickers({
    showSaveFilePicker: () => Promise.resolve(makeHandle('a').handle),
  })

  assert.equal(canSaveWithFileHandle(), true)
  assert.equal(canOpenWithFileHandle(), false)
})

// MARK: Saving

void test('saving writes back to the linked handle without a picker', async () => {
  const fake = makeHandle('drawing.excalidraw', 'old contents')
  let pickerCalls = 0

  setPickers({
    showSaveFilePicker: () => {
      pickerCalls += 1
      return Promise.resolve(makeHandle('other.excalidraw').handle)
    },
  })

  const json = '{"type":"excalidraw"}'
  const saved = await saveDrawingFile(json, 'drawing', fake.handle)

  assert.equal(saved, fake.handle)
  assert.equal(pickerCalls, 0)
  assert.equal(fake.text(), json)
})

void test('first save asks for a location once and links the handle', async () => {
  const picked = makeHandle('my-drawing.excalidraw')
  const calls: Array<string | undefined> = []

  setPickers({
    showSaveFilePicker: (options?: { suggestedName?: string }) => {
      calls.push(options?.suggestedName)
      return Promise.resolve(picked.handle)
    },
  })

  const saved = await saveDrawingFile('{}', 'my-drawing', null)

  assert.equal(saved, picked.handle)
  assert.deepEqual(calls, ['my-drawing.excalidraw'])
  assert.equal(picked.text(), '{}')
})

void test('a linked handle whose file was deleted asks again', async () => {
  const gone = makeHandle('gone.excalidraw')
  const picked = makeHandle('restored.excalidraw')
  let pickerCalls = 0

  gone.remove()
  setPickers({
    showSaveFilePicker: () => {
      pickerCalls += 1
      return Promise.resolve(picked.handle)
    },
  })

  const saved = await saveDrawingFile('{}', 'gone', gone.handle)

  assert.equal(pickerCalls, 1)
  assert.equal(saved, picked.handle)
  assert.equal(picked.text(), '{}')
})

void test('save surfaces write errors instead of silently re-picking', async () => {
  const broken = {
    name: 'broken.excalidraw',
    getFile: () => Promise.resolve(new File(['{}'], 'broken.excalidraw')),
    createWritable: () =>
      Promise.reject(new DOMException('No space left', 'QuotaExceededError')),
  } as unknown as FileSystemFileHandle

  setPickers({
    showSaveFilePicker: () =>
      Promise.resolve(makeHandle('other.excalidraw').handle),
  })

  await assert.rejects(saveDrawingFile('{}', 'broken', broken))
})

// MARK: Opening

void test('opening uses file handles when the picker exists', async () => {
  const fake = makeHandle('opened.excalidraw', '{"type":"excalidraw"}')

  setPickers({ showOpenFilePicker: () => Promise.resolve([fake.handle]) })

  const opened = await pickDrawingFiles()

  assert.equal(opened.length, 1)
  assert.equal(opened[0]?.handle, fake.handle)
  assert.equal(opened[0]?.file.name, 'opened.excalidraw')
})

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

void test('isMissingFileError only matches NotFoundError', () => {
  assert.equal(
    isMissingFileError(new DOMException('gone', 'NotFoundError')),
    true,
  )
  assert.equal(
    isMissingFileError(new DOMException('nope', 'NotAllowedError')),
    false,
  )
  assert.equal(isMissingFileError(null), false)
  assert.equal(isMissingFileError(new Error('gone')), false)
})

void test('isAbortError only matches AbortError', () => {
  assert.equal(isAbortError(new DOMException('cancelled', 'AbortError')), true)
  assert.equal(isAbortError(new DOMException('gone', 'NotFoundError')), false)
  assert.equal(isAbortError(new DOMException('nope', 'NotAllowedError')), false)
  assert.equal(isAbortError(null), false)
  assert.equal(isAbortError(new Error('cancelled')), false)
})

// MARK: Change detection

void test('fileStatOf reads size and lastModified without the contents', () => {
  const file = new File(['hello'], 'drawing.excalidraw', { lastModified: 1234 })

  assert.deepEqual(fileStatOf(file), { lastModified: 1234, size: 5 })
})

void test('hasFileChanged is false only for an identical stat', () => {
  const stat = { lastModified: 1000, size: 42 }

  assert.equal(hasFileChanged(undefined, stat), true)
  assert.equal(hasFileChanged(stat, { ...stat }), false)
  assert.equal(hasFileChanged(stat, { lastModified: 1001, size: 42 }), true)
  assert.equal(hasFileChanged(stat, { lastModified: 1000, size: 43 }), true)
})
