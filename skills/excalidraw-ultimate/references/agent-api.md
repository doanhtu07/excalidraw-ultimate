# Agent API

`window.__EXCALIDRAW_AGENT__` is the single control surface. It is registered while the editor is mounted and is safe to call repeatedly.

All reads return plain JSON (CDP `returnByValue`). All mutations return:

```ts
{ created: string[], updated: string[], deleted: string[], warnings: string[] }
```

## Read

### `getState(): AgentState`

```ts
{
  version: 1,
  ready: boolean,
  url: string,
  workspaceRoot: string,      // absolute project root this page drives
  activeTabId: string | null,
  tabs: [{
    id: string,
    name: string,
    filePath: string | null,   // absolute path when opened by the bridge
    fileName: string | null,
    dirty: boolean,
    active: boolean
  }]
}
```

### `describe(): AgentDescribeResult`

```ts
{
  count: number,
  byType: Record<string, number>,
  elements: [{
    id, type, x, y, width, height,
    text?,          // bound label, resolved onto the container
    containerId?,   // for text elements bound to a shape
    start?, end?,   // arrow bindings
    locked?
  }],
  filePath: string | null,
  name: string | null,
  dirty: boolean,
  text: string      // compact human/agent-readable summary
}
```

### `getScene(): { elements, appState, files }`

`elements` are full Excalidraw elements (including version metadata). `appState` is a serialisable subset: `scrollX`, `scrollY`, `zoom`, `viewBackgroundColor`, `gridSize`, `gridModeEnabled`, `theme`. `files` is Excalidraw's binary file map (images).

## Write

### `add(elements, { scroll? })`

`elements` may be one object or an array. Agent-friendly fields are normalised:

```js
await agent.add([
  {
    id: 'api',
    type: 'rectangle',
    x: 100,
    y: 100,
    width: 180,
    height: 70,
    text: 'API',
  },
  {
    id: 'db',
    type: 'rectangle',
    x: 100,
    y: 300,
    width: 180,
    height: 70,
    text: 'DB',
  },
  { type: 'arrow', x: 0, y: 0, startElementId: 'api', endElementId: 'db' },
])
```

- `text` → bound `label.text` (text elements keep `text`).
- `startElementId` / `endElementId` → bound arrow.
- `points: [[x, y], …]` stays as tuples (Excalidraw's format); `{ x, y }` objects are accepted and converted.
- `fontFamily: "excalifont"` (or `helvetica`, `cascadia`, `nunito`, …) → numeric font id.
- Generated ids are returned in `created`. Supplied ids are kept.

`scroll: true` zooms to fit the new elements.

### `apply({ create?, update?, delete? })`

One `updateScene` call, one undo entry. Updates may target elements created in the same patch.

```js
await agent.apply({
  create: [{ id: 'note', type: 'text', x: 60, y: 60, text: 'Draft' }],
  update: [{ id: 'api', set: { backgroundColor: '#a5d8ff' } }],
  delete: ['old-note'],
})
```

### `update(id, set)`

Shorthand for one update. `set` is a partial element. Changing `text` on a shape updates its bound text element when one exists; if the shape has no label, a warning is returned.

### `deleteElements(ids)`

Soft-deletes the elements and their bound labels (`isDeleted: true`), preserving history. It does not remove unrelated arrows; delete those explicitly.

### `clear()`

Removes every element via `resetScene()`. The CLI requires `--yes`. **Do not call this unless the user asked.**

### `restore({ elements, appState?, files? })`

Replaces the scene with a snapshot payload (what `snapshot save` stores). Images are re-added first. This is how `snapshot restore` works.

## Drawings

### `open(path)`

Reads the file through the dev-only endpoint and appends a tab (or activates the tab when that path is already open). Resolves `{ tabId, path }`. The tab is linked to the path, so `save` writes back.

### `save()`

Saves the active tab to its path or file handle. Returns the tab state at call time.

### `setViewport({ fit?, ids?, zoom?, animate? })`

- `fit: true` — zoom to fit all content.
- `ids: ['a', 'b']` — zoom to fit those elements.
- `zoom: 1.4` — set zoom (clamped 0.1–8).
- `animate` defaults to `true`.

## Driving it over CDP

The CLI is a thin wrapper. A custom integration can do the same:

```js
const targets = await fetch('http://127.0.0.1:9333/json/list').then((r) =>
  r.json(),
)
const page = targets.find(
  (t) => t.type === 'page' && t.url.startsWith('http://localhost:3000'),
)
const ws = new WebSocket(page.webSocketDebuggerUrl)
// send { id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }
```

The page must be the app, and `window.__EXCALIDRAW_AGENT__` must be truthy. The debug browser is launched by the CLI with a dedicated profile and `--remote-debugging-port=9333`.

## Errors

- `No drawing is open.` — call `open(path)` first.
- `No element with id "…".` — re-read `describe`; ids are case-sensitive.
- `None of the requested element ids exist.` — viewport ids were stale.
- `Page evaluation failed: …` — the underlying Excalidraw call rejected; the message is passed through.
- `Timed out waiting for the Excalidraw agent bridge` — the page did not finish loading; run `status`, check `stop` then `open` again.
