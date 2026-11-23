# Design Inspiration

When the user prompt is about **design, UI ideas, or components**, explore outside the codebase before proposing — don't design from scratch in a vacuum.

## Sources (in order)

1. **21st.dev community components** — `https://21st.dev/community/components`
   - Browse for relevant patterns (layout, nav, sheets, gallery cards, empty states, etc.).
   - Use `WebFetch`/`WebSearch` to inspect promising entries. Note what makes them work (spacing, hierarchy, motion), not just how they look.

2. **Local tanstack-media app (design gallery)** — `apps/tanstack-media/`
   - Curated gallery of prior inspirations: one JSON per entry in `src/features/gallery/data/gallery-items/<id>.json`, images in `public/designs/`.
   - Check existing entries for matching `designType` / keywords before suggesting something new — reuse the vocabulary when it fits.
   - Run locally to browse visually: `pnpm --filter @apps/tanstack-media dev --port 3000`.
   - Each card exposes COPY BRIEF / COPY IMAGE PROMPT plus SOURCE ↗ link — reuse those when they match the task.

## Rules

1. **Adapt, never pixel-copy.** Take structure, rhythm, and interaction ideas; rewrite copy, palette, and motif for PixelPict. (Same originality constraint as the `add-design` skill.)
2. **Cite sources.** In your reply, link the 21st.dev component(s) and/or local gallery `id`(s) you drew from, plus one line on what you borrowed from each.
3. **Prefer existing gallery vocabulary.** If a matching `designType`/keyword already exists, say so instead of inventing a parallel term.
4. **New inspiration found?** Offer to install it via the `add-design` skill pipeline (`sample-palette` → draft JSON → `add-design` → `typecheck`/`test`), but don't install unasked.
