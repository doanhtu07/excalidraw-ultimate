# UI and interaction map

## What you are looking at

```
┌─────────────────────────────────────────────────────────────┐
│ [Drawing A ×] [Drawing B ×] [+]            [open] [save]   │  tab bar
├─────────────────────────────────────────────────────────────┤
│ file  /Users/me/repo/docs/architecture.excalidraw           │  file strip (UI)
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    Excalidraw canvas                        │
│              (the live Excalidraw editor)                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- **Tab bar** — one tab per drawing. `+` creates an untitled drawing, the folder button opens the file picker, the save button saves the active tab. Tabs can be dragged to reorder and closed with `×`.
- **File strip** — a one-line status strip between the tab bar and the canvas. It shows the absolute path when the drawing was opened through the agent bridge, otherwise the file name with `(path unavailable)` or `(unsaved)`. A drawing with unsaved changes also shows `unsaved`. It is app UI: it never enters the scene and never appears in an exported `.excalidraw` file. It does appear in a default full-window screenshot; `screenshot --canvas` crops it out.
- **Canvas** — the real `@excalidraw/excalidraw` editor, with its normal toolbar, zoom controls, and shortcuts. Agents should not need to touch them.
- **Debug browser** — a headed Chrome/Brave/Edge window with a dedicated profile under `<repo>/.excalidraw-ultimate/runtime`. It is the window the user can watch; screenshots come from it.

Hide the HUD for a clean screenshot by adding `?hud=0` to the app URL and reloading. The default is on, and you should usually keep it.

## Opening drawings

Drawings are opened **by absolute path only**:

- The human clicks **Open file** in the tab bar and types/picks a recent absolute path in the modal.
- The agent runs `open <path>`, which uses the same dev-only bridge.
- Dropping a file from the OS creates an untitled dirty tab; the first save asks for a path.

Saving always writes back through the same bridge to the tab's recorded path. There is no File System Access handle, so every tab (except a dropped file) has a known path and the HUD shows it.

Opening a path appends a tab, or activates the existing tab when the path is already open. It does not clear existing tabs or the current drawing.

The skill reuses one debug browser and one dev server, but each project has its own app page keyed by `?workspace=<project root>`. `open` finds/creates the page for the current project (git root or `EXCALIDRAW_ULTIMATE_PROJECT`), so parallel agents do not share active tabs. Workspace windows are isolated by URL and can be focused from the workspace chip in the tab bar.

## The agent bridge

While the editor is mounted, the page exposes:

```js
window.__EXCALIDRAW_AGENT__.help()
window.__EXCALIDRAW_AGENT__.getState()
window.__EXCALIDRAW_AGENT__.describe()
```

The CLI discovers the page over CDP (`http://127.0.0.1:9333`), calls these methods with `Runtime.evaluate`, and prints the JSON result. See [agent-api.md](agent-api.md) for every method.

Why not click the toolbar or dispatch synthetic pointer events?

- Drawing through the UI is slow and stateful: tool selection, pointer coordinates, zoom, and history all interfere.
- Synthetic events are easy to get wrong and hard to verify.
- The bridge calls Excalidraw's own `updateScene`, so undo/redo, bindings, and rendering behave like real edits.
- Screenshots still show the real UI, so you get visual truth without UI automation.

## Saving

- `save` (CLI) saves the active tab. `Cmd/Ctrl+S` does the same in the app.
- Agent-opened drawings write to their path. Picker-opened drawings write through their file handle or ask for a location once.
- The tab's dirty flag clears when the write succeeds; the HUD's `unsaved` label disappears.
- `save` is explicit. Editing the canvas does not auto-save.

## Live updates

The editor keeps the latest scene of every tab in a ref updated by Excalidraw's `onChange`. Programmatic `add`/`update`/`delete` calls also flow through the same state, so:

- `describe` reflects your last mutation immediately.
- A human editing in the visible window shows up in the next `describe`/`screenshot`.
- Only the active tab is mounted as a canvas; hidden tabs keep their last scene snapshot in memory and are remounted on tab switch.

## Dev-only file endpoints

The Vite dev server mounts these (they do not exist in a production build):

| Endpoint                                     | Purpose                                              |
| -------------------------------------------- | ---------------------------------------------------- |
| `GET /__excalidraw/agent/health`             | Identifies this app (used by `status`)               |
| `GET /__excalidraw/agent/file?path=<abs>`    | Read a drawing; returns `{ path, name, text, stat }` |
| `GET /__excalidraw/agent/stat?path=<abs>`    | File metadata only                                   |
| `POST /__excalidraw/agent/file`              | Write `{ path, text }` atomically                    |
| `DELETE /__excalidraw/agent/file?path=<abs>` | Delete a drawing or workspace state file             |
| `GET /__excalidraw/agent/workspaces`         | Registered project workspaces                        |
| `POST /__excalidraw/agent/workspaces`        | Register `{ root, name? }`                           |
| `POST /__excalidraw/agent/workspace/init`    | Create `.excalidraw-ultimate/` for a project         |

Rules: `.excalidraw` / `.json` only, 20 MB max, no `.git` or `node_modules` segments, atomic writes through a sibling temp file. Set `EXCALIDRAW_ULTIMATE_ALLOWED_ROOTS` (path-delimiter-separated directories) in the app's `.env` to confine access to one or more trees.

## Workspaces and persistence

The CLI targets `/?workspace=<project root>`, so each project has its own page, tabs, and active drawing while sharing one dev server and one debug browser. The workspace chip in the tab bar lists registered projects and opens or focuses their windows.

Tabs and unsaved scenes persist in `<project>/.excalidraw-ultimate/`:

- `workspace.json` — tab order, active tab, linked paths, dirty baselines
- `recovery/<name>--<id>.excalidraw` — self-contained scenes for dirty or untitled tabs

Clean path-linked tabs reload from their source file. A nested `.gitignore` (`*`) keeps the state directory out of git. Changing the allow-list still requires a dev-server restart; normal drawing work does not.

Runtime state for the checkout lives in `<repo>/.excalidraw-ultimate/runtime/` (dev-server log/PID, debug browser profile). The workspace switcher index is `<repo>/.excalidraw-ultimate/workspaces.json`. Snapshots and default screenshots live under each workspace's `.excalidraw-ultimate/`. Override the runtime location with `EXCALIDRAW_ULTIMATE_STATE_DIR`. All settings for the skill and the app live in the app root's `.env`; `EXCALIDRAW_ULTIMATE_ENV_FILE` points both at another file.

## Typical interaction script

```bash
S="<skill>/scripts/excalidraw.mjs"

node "$S" open docs/architecture.excalidraw
node "$S" describe                      # read ids and layout
node "$S" snapshot save before-edit
node "$S" add --one '{"id":"svc","type":"rectangle","x":120,"y":120,"width":180,"height":70,"text":"API"}'
node "$S" screenshot --out /tmp/check.png
# view /tmp/check.png, fix what is wrong
node "$S" update svc --set '{"width":220}'
node "$S" screenshot --out /tmp/check.png
node "$S" save
```

If a command fails, run `status` first: it reports whether the dev server, debug browser, app page, and bridge are alive, plus the dev-server log tail.
