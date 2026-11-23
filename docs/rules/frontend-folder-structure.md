# Frontend Folder Structure

Use a feature-first layout for web apps (TanStack Start / React). Code is organized by domain first, with `src/components/` reserved for purely presentational pieces.

## Layout

```
src/
  features/
    <domain>/                  # one folder per domain (e.g. workspace)
      <domain>-model.ts        # domain types + pure helpers (naming, IDs)
      <domain>-io.ts           # I/O helpers (file system, network, serialization)
      <domain>-container.tsx   # stateful orchestrator component(s)
      <domain>-view.tsx        # domain-coupled views that need the domain's internals
      <piece>/                 # a view that has its own styles
        <piece>.tsx
        <piece>.module.css
  components/                  # presentational only — props in, JSX out
    <widget>/
      <widget>.tsx
      <widget>.module.css      # styles scoped to that component only
    svgs/                      # one icon component per file
  routes/                      # thin: map routes to feature containers
  styles/
    global.css
    <route>.module.css         # route-level styles (home.module.css, …)
```

Real example from `apps/excalidraw-client`:

```
src/
  features/workspace/
    editor-tabs.ts        # EditorTab type, ID + Untitled-N naming
    excalidraw-file.ts    # open/save/serialize drawing files
    excalidraw-editor.tsx # container: state, shortcuts, drag & drop
    excalidraw-tab.tsx    # mounted Excalidraw canvas per tab
  components/
    editor-tab-bar.tsx    # tab strip, props-driven
    editor-tab-action.tsx # toolbar icon button
    empty-workspace.tsx   # empty state
    svgs/plus-svg.tsx     # one SVG component per file
```

## Styling: CSS Modules

Style components with **CSS Modules** (`.module.css`), co-located with the component they style — one stylesheet per component/piece, named after it: `components/button/button.tsx` + `components/button/button.module.css`. Route-level styles live in `styles/<route>.module.css`. Never add component styles to `global.css`.

### Template

```css
/* button.module.css */
@reference '#global.css';

.root {
  @apply flex items-center gap-2 rounded px-2 py-1;

  background-color: var(--color-primary);
  color: var(--color-primary-fg);
}
```

```tsx
// button.tsx
import styles from './button.module.css'
// ...

export const Button = ({ className, ...rest }: Props) => {
  return <button className={cn(styles.root, className)} {...rest} />
}
```

### Rules

1. **`@reference '#global.css';` is the first line of every module** — it enables `@apply` and editor IntelliSense through the `#global.css` package subpath import, without re-emitting the global stylesheet.
2. **Import as `import styles from './<name>.module.css'`** and access classes as `styles.className`.
3. **camelCase class names** (`completedText`, `deleteButton`) so they read as `styles.completedText`; the component's entry class is always `.root`.
4. **Compose caller overrides with `cn(styles.root, className)`** (`clsx` + `tailwind-merge`) instead of string concatenation. The `cn` helper lives in `utils/tailwind-merge.ts` — the one `utils/` resident this rule expects early.
5. **`@apply` for utility composition, CSS custom properties (`var(--color-primary)`) for tokens.** Avoid hard-coded hex values and avoid sprinkling raw Tailwind utilities across JSX — className strings in TSX are for layout glue and one-off tweaks, not for styling whole components.

## Rules

1. **`features/<domain>/` owns everything domain-coupled** — state containers, domain types, I/O helpers, and views that reach into the domain's internals (refs, lazy-loaded SDKs, etc.). When a second domain appears, it gets its own `features/<name>/` folder with the same shape.

2. **`components/` is presentational only** — components receive data and callbacks through props, own no domain state, and perform no I/O. If a component needs to know how the domain works, it belongs in the feature, not here.

3. **Import directions**
   - `features → components` is allowed: containers compose presentational components.
   - `components → features` is allowed for **type-only imports** (e.g. `import type { EditorTab }`), never for logic or runtime values.

4. **No `lib/` or `utils/` junk drawers.** Don't create a generic dumping-ground folder for domain code. Add `utils/` only when the first genuinely generic, stateless, pure helper appears (e.g. `clamp()`, `debounce()`) — and keep it free of domain types.

5. **One exported component per file.** Helper functions that only serve that component may live in the same file; a second component may not. One-off icons are an exception-by-inlining (`<svg>` written directly in JSX) only when used exactly once — otherwise they get their own file in `components/svgs/` named `<name>-svg.tsx` exporting `<Name>Svg`. A component that grows its own stylesheet moves into a folder: `<name>/<name>.tsx` + `<name>.module.css`.

6. **`routes/` stays thin** — routes map URLs to feature containers and set head metadata. No UI beyond layout shells, no domain logic.

7. **Component body sections use `// MARK:` comments** (`Variables + States`, `Effects`, `Tab actions`, `Renderers`, …) — same convention as the React Native rule, applied to web components too. See `react-native-component-structure.md`.

8. **Props that accept a React component or node are PascalCase** — `Leading?: ReactNode`, not `leading?: ReactNode`, so a render slot reads like the component it holds. `children` is the one exception, and data/callback props stay camelCase (`tabs`, `onSelectTab`).
