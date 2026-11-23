# excalidraw-ultimate

## Quick start

Requires Node.js and pnpm.

1. Clone this repo and install its dependencies. Keep the clone — the app runs from it:

   ```sh
   git clone https://github.com/doanhtu07/excalidraw-ultimate.git ~/excalidraw-ultimate
   cd ~/excalidraw-ultimate
   pnpm install
   ```

2. From inside the project you want to draw in, install the skill into that project:

   ```sh
   cd /path/to/your-project
   node ~/excalidraw-ultimate/skills/excalidraw-ultimate/scripts/install.mjs --project --target claude,opencode,agents
   ```

   `--project` writes to `.claude/skills`, `.opencode/skills`, and `.agents/skills` at that project's git root. Use `--global` instead to make the skill available in every project.

3. Uninstall from the same project:

   ```sh
   node ~/excalidraw-ultimate/skills/excalidraw-ultimate/scripts/uninstall.mjs --project
   ```

   Add `--all` to remove both the project-local and global installs.

## Agent skill

`skills/excalidraw-ultimate` lets a coding agent drive the real client: open a drawing by absolute path, inspect its elements, add/update/delete by id, screenshot the canvas, verify, and save. It starts the dev server and a headed debug browser on demand, and every screenshot carries the drawing's path in a strip under the tabs (UI only — it is never written into the scene or the `.excalidraw` file).

To install once for every project, run the installer from inside the clone (or point to it) with `--global`:

```sh
node ~/excalidraw-ultimate/skills/excalidraw-ultimate/scripts/install.mjs --global --target claude,opencode,agents
```

The installer records the app root inside copied skill directories (symlinked installs resolve back to this checkout). Re-running upgrades in place; `--copy`, `--force`, `--dry-run`, and `--json` are supported.

## Where it writes

The app keeps all of its state in `.excalidraw-ultimate/` folders, and only two kinds of them exist:

| Location                                | What lives there                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `<repo>/.excalidraw-ultimate/`          | The clone's switching registry (`workspaces.json`) and `runtime/`: dev-server log and PID, debug-browser PID and its Chrome profile |
| `<every project>/.excalidraw-ultimate/` | That workspace's tab layout (`workspace.json`), recovery drafts (`recovery/`), snapshots, and default screenshots                   |

- `<repo>` is this cloned checkout. `<every project>` is each folder opened as a workspace (its git root); its state folder is created inside that project, not in the checkout and not in any shared location.
- Nothing else is written for app state — not in your home directory, not in system temp, and not in a shared cache. The only files the tool puts outside these folders are the skill copies the installer places in your agent's skills directory.
- Both state folders are kept out of Git: the checkout's `.gitignore` already lists `.excalidraw-ultimate`, and project state folders are created with their own `.gitignore` containing `*`, so they never appear in `git status`.
- Two explicit overrides exist if you want them: `EXCALIDRAW_ULTIMATE_STATE_DIR` relocates the checkout's `runtime/`, and `screenshot --out <path>` writes that one PNG wherever you point it.

After installing, an agent starts with:

```sh
node "<skill>/scripts/excalidraw.mjs" open path/to/drawing.excalidraw
```

Read [the skill](skills/excalidraw-ultimate/SKILL.md) for the command set, the drawing rules, and the screenshot verification loop.
