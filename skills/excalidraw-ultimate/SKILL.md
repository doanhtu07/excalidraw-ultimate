---
name: excalidraw-ultimate
description: 'Use when an agent needs to open, inspect, draw, edit, verify, or save an Excalidraw drawing in the Excalidraw Ultimate client. Drives the real app at http://localhost:3000 through its in-page agent bridge, with screenshots, snapshots, and a file-path strip so screenshots identify the drawing. Also use when asked to install or uninstall this skill for Claude Code, OpenCode, or any agent that reads .agents/skills.'
license: MIT
---

# Excalidraw Ultimate

You have a live Excalidraw editor you can drive. The user can watch the same canvas in a normal browser window while you work. You can see the result by taking a screenshot and reading it back.

`<skill>` below is the directory that contains this `SKILL.md`. The scripts are at `<skill>/scripts/`.

## Install and uninstall

Install (records the app root inside copied skills, then links/copies this skill into agent skill directories):

```bash
node "<skill>/scripts/install.mjs" --global --target claude,opencode,agents
```

Project-only install (run from the project you want to use it in; writes to that project's `.claude/skills`, `.opencode/skills`, `.agents/skills`):

```bash
cd <your-project>
node "<skill>/scripts/install.mjs" --project --target claude,opencode,agents
```

Uninstall:

```bash
node "<skill>/scripts/uninstall.mjs" --global
node "<skill>/scripts/uninstall.mjs" --project
node "<skill>/scripts/uninstall.mjs" --all
```

Useful flags: `--copy` (copy instead of symlink), `--force`, `--dry-run`, `--json`. The installer is idempotent; re-running upgrades the link in place. Uninstall refuses to delete a destination that is not this skill unless `--force` is passed.

If a user asks _you_ to install the skill, run the installer, read this file, then verify with:

```bash
node "<skill>/scripts/excalidraw.mjs" status
node "<skill>/scripts/excalidraw.mjs" open <path/to/a/test.excalidraw>
node "<skill>/scripts/excalidraw.mjs" add --one '{"type":"rectangle","x":80,"y":80,"width":200,"height":80,"text":"It works"}'
node "<skill>/scripts/excalidraw.mjs" screenshot --out /tmp/excalidraw-test.png
```

## The one-command start

`open` starts everything: the Vite dev server (if needed), a headed Chrome window with the DevTools Protocol on port 9333, and the app page. There is **no separate backend or WebSocket server** — the canvas is the page itself, the live app is the transport, and the CLI talks to it over CDP.

```bash
node "<skill>/scripts/excalidraw.mjs" open /absolute/path/to/drawing.excalidraw
```

The path may be relative to the current directory. Opening appends a tab (or activates the existing tab when that path is already open); it does not close other drawings. Commands target the page for the current project (its git root, or `EXCALIDRAW_ULTIMATE_PROJECT`). One debug browser and one dev server are shared, but every project gets its own page, tabs, and `.excalidraw-ultimate/` state, so parallel agents do not fight over the active tab. Select another workspace from the workspace chip in the tab bar to open or focus its window.

## First move, every time

1. `open <file>` (or `status` if you think it is already open).
2. `describe` — read the ids, positions, labels and bindings before changing anything.
3. `snapshot save before-edit` if you are about to make a non-trivial change.
4. Edit only through the commands below.
5. `screenshot` and actually look at the image. Fix what you see. Repeat.
6. `save` when the result passes the checklist.

Screenshots include a **file** strip directly under the tab bar with the drawing's absolute path (it is UI, not part of the scene or the exported file). Check it every time: if the strip is not the file you meant, stop and open the right one. `screenshot --canvas` crops the strip out; keep the default full-window screenshot when you need the path in the image.

## Golden rules (do not mess up the drawing)

- **Never `clear` unless the user explicitly asks.** `clear` requires `--yes` for a reason.
- **Do not replace the scene to change one thing.** Use `update`/`delete` by id. Rebuilding the scene loses ids, bindings, and history.
- **Read before write.** `describe` first; ids are stable and cheap to use.
- **Snapshot before risky edits.** `snapshot save <name>` then edit; `snapshot restore <name>` rolls back. Snapshots are per drawing path.
- **Preserve existing work.** If the user opened an existing drawing, add around it or change only what was requested. Do not restyle unrelated elements.
- **Never invent ids.** Only use ids returned by `describe` or `add`/`apply`.
- **One batch, one verification.** After a batch of elements, screenshot and run the quality checklist before adding the next layer.
- **Save at the end.** The badge says `unsaved` while a tab has unsaved changes. `save` writes back to the same path.
- **Only touch the drawing file.** The dev bridge has file endpoints, but this skill is not a general file editor.

## Commands

All commands print JSON unless noted. `--help` prints usage.

| Task                                 | Command                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| Health, tabs, bridge                 | `status`                                                           |
| Open a drawing                       | `open <file>`                                                      |
| Read the scene                       | `describe` (text), `elements` (full JSON)                          |
| Create elements                      | `add <file>` / `add -` (stdin) / `add --one '<json>'`              |
| Create + update + delete in one call | `apply <patch.json>`                                               |
| Patch one element                    | `update <id> --set '{"width":220}'`                                |
| Delete elements                      | `delete <id> <id> ...`                                             |
| Save to the opened path              | `save`                                                             |
| See the canvas                       | `screenshot [--out file.png] [--canvas] [--full]`                  |
| Fit / focus the view                 | `viewport --fit`, `viewport --ids a,b`, `viewport --zoom 1.4`      |
| Snapshots                            | `snapshot save <name>`, `snapshot list`, `snapshot restore <name>` |
| Close this workspace's page          | `close`                                                            |
| Stop this workspace                  | `stop` (stops browser/server when it was the last page)            |
| Stop everything                      | `stop --all`                                                       |

`apply` accepts one patch:

```json
{
  "create": [
    {
      "id": "api",
      "type": "rectangle",
      "x": 100,
      "y": 100,
      "width": 180,
      "height": 70,
      "text": "API"
    }
  ],
  "update": [{ "id": "api", "set": { "backgroundColor": "#a5d8ff" } }],
  "delete": ["old-box"]
}
```

## Element format

Agent-friendly input is normalized for you:

- Shape label: `"text": "API Server"` (becomes Excalidraw's bound label).
- Arrow bindings: `"startElementId": "api"`, `"endElementId": "db"` (auto-route to element edges).
- Points: `"points": [[0, 0], [80, -40], [200, 0]]`.
- Fonts: `"fontFamily": "excalifont"` (or `"helvetica"`, `"cascadia"`, `"nunito"`, …).
- Ids: supply your own (`"id": "db"`) to update later; omit them and the editor generates one.
- Text elements: `{"type":"text","x":80,"y":60,"width":300,"height":30,"text":"Zone A","fontSize":18}`.

Coordinates are scene coordinates: x grows right, y grows down, origin arbitrary. Plan a grid before writing the batch.

A shape update patches the element itself. Changing `"text"` on a shape updates its bound label when one exists; a shape created without `text` has no label, so recreate it with `text` or update its text element by id.

## Quality loop (this is the whole job)

After each batch, capture and inspect:

```bash
node "<skill>/scripts/excalidraw.mjs" screenshot --out /tmp/check.png
```

Then read `/tmp/check.png` with your image viewer. Check:

1. **Truncation** — every label fully visible; widen/taller shapes or shorten text.
2. **Overlap** — no shapes share space; background zones contain children with padding.
3. **Arrow crossing** — arrows must not cut through unrelated shapes; add waypoints or reroute.
4. **Arrow-label overlap** — labels sit at arrow midpoints; keep them short and sparse.
5. **Spacing** — at least 40px between siblings, 80–120px between tiers.
6. **Readability** — body text ≥ 16, titles ≥ 20.
7. **Path strip** — the file under the tabs is the file you meant.

If something is wrong: fix it, re-screenshot, and say what you fixed. Do not continue stacking elements on a broken layout.

Read [references/drawing-rules.md](references/drawing-rules.md) before a complex diagram. It covers the anti-patterns that most often ruin agent-drawn diagrams (labels on background zones, cross-zone arrows, arrow-label noise, sizing).

## How the app and UI work

Read [references/ui-map.md](references/ui-map.md) for the tab bar, open/save behavior, the path badge, and what the debug browser shows. Key point: **do not click or scrape the Excalidraw toolbar.** The bridge exposes the same operations through Excalidraw's own imperative API; UI clicking is slower, brittle, and can leave the editor in a tool mode.

The in-page API (useful when debugging or writing a custom integration) is documented in [references/agent-api.md](references/agent-api.md). It is also available from the page:

```js
window.__EXCALIDRAW_AGENT__.help()
```

## Failure recovery

- **`status` says the dev server is down** — run any command; `open` auto-starts it. If the port is taken by another app, set `EXCALIDRAW_ULTIMATE_URL` to the app's real URL.
- **No debug browser** — the CLI launches Chrome/Brave/Edge. Override with `EXCALIDRAW_ULTIMATE_BROWSER=/path/to/chrome`, or use `--headless` on `open`/`describe`/`screenshot`.
- **Bridge missing / page stale** — `close` this workspace, then run `open` again; use `stop --all` if the browser itself is stale. The debug browser has a dedicated profile; it never touches the user's daily browser profile.
- **Element not updating** — check the id with `describe`; locked elements include `(locked)`.
- **Bad state** — `snapshot restore <name>`, or `snapshot save` then rebuild. Only `clear --yes` if the user asked.
- **Save fails** — the tab may not be linked to a path. Re-`open` the file so the badge shows an absolute path, then `save`.

## Why no WebSocket

The Vite dev server + Chrome DevTools Protocol is enough for one agent steering one visible canvas, with no extra process, port, or protocol to maintain. A WebSocket server becomes worthwhile only when several agents/humans must stream edits into the same canvas concurrently or when the agent must react continuously to live edits. For that future, the bridge is already the single place where scene mutations enter the app.
