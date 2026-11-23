# Drawing rules

Adapted from the quality guidance in [mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) (MIT), trimmed to what the workspace bridge supports.

## Plan before you draw

Write down the tiers and x positions first. A typical flow:

```
y=80    [ Client ]                     [ Mobile ]
y=240   [ Load balancer ]  →  [ API ]  ←  [ Worker ]
y=400                     [ PostgreSQL ]   [ Redis ]
```

- Tier spacing: 80–120px (room for arrows and labels).
- Sibling spacing: 40–60px minimum; 120px+ when arrows carry labels.
- Shape width: `max(160, labelLength * 12)`; height 60 for one line, 80 for two.
- Zone padding: 50px on every side.

Custom ids make updates easy: `"id": "api"`, `"id": "db"`, `"id": "edge-api-db"`.

## Do not label background zones with the shape label

A label bound to a large zone rectangle is centered _inside_ the zone, on top of every child. Put a free-standing text element at the top-left of the zone instead.

Wrong:

```json
{
  "id": "vpc",
  "type": "rectangle",
  "x": 40,
  "y": 40,
  "width": 820,
  "height": 420,
  "text": "VPC"
}
```

Right:

```json
{ "id": "vpc", "type": "rectangle", "x": 40, "y": 40, "width": 820, "height": 420, "backgroundColor": "#e3f2fd" },
{ "id": "vpc-label", "type": "text", "x": 60, "y": 50, "width": 200, "height": 30, "text": "VPC", "fontSize": 18 }
```

## Keep arrows inside a zone or tier

An arrow from a node in one zone to a distant node draws a long diagonal through everything between them. For cross-zone relationships:

- Put the zones edge-to-edge with no elements between them and route along the gap, or
- use an annotation text instead of a line, or
- use an elbowed arrow that travels along the perimeter.

Elbowed arrow:

```json
{
  "type": "arrow",
  "x": 100,
  "y": 100,
  "points": [
    [0, 0],
    [0, -50],
    [200, -50],
    [200, 0]
  ],
  "elbowed": true
}
```

Curved arrow around an obstacle:

```json
{
  "type": "arrow",
  "x": 100,
  "y": 100,
  "points": [
    [0, 0],
    [50, -40],
    [200, 0]
  ],
  "roundness": { "type": 2 }
}
```

Bound arrows (`startElementId` / `endElementId`) re-route automatically when their endpoints move. Prefer them for simple connections.

## Arrow labels are expensive

Labels sit at the midpoint and collide with shapes on short arrows. Add one only when the relationship name is essential (protocol, port, data direction), keep it ≤ 12 characters, and never label every arrow.

## Style that reads as intentional

- `"fillStyle": "solid"` for crisp flat fills (the default is sketchy hachure).
- Pair a pastel fill with its darker stroke:

| Fill             | Stroke    |
| ---------------- | --------- |
| `#a5d8ff`        | `#1971c2` |
| `#b2f2bb`        | `#2f9e44` |
| `#ffec99`        | `#f08c00` |
| `#ffc9c9`        | `#e03131` |
| `#d0bfff`        | `#6741d9` |
| `#e3f2fd` (zone) | `#74c0fc` |

- `"strokeStyle": "dashed"` for zone borders and asynchronous links.
- Keep to one or two accent colors; color should encode meaning (tier, sync/async, external), not decoration.
- Titles 20–28, body 16–18, annotations 12–14. Avoid < 12.

## Verification checklist

After every batch (`add` / `apply`), take a screenshot and check:

1. Every label fully visible, no clipping.
2. No overlapping shapes; zones contain children with padding.
3. Arrows do not cross unrelated shapes.
4. Arrow labels do not sit on shapes.
5. ≥ 40px gaps, ≥ 80px between tiers.
6. Text sizes readable at the fit-to-screen zoom.
7. The file strip under the tabs names the intended drawing.
8. The layout still means the same thing after the change.

Fix, re-screenshot, then continue. A diagram that needs a second look is not done.

If a label looks clipped even though the shape is wide enough, the text element's stored width is too small (labels measured before a font finished loading). Update the text element directly with a larger width, or delete and recreate the shape — new elements are measured after the fonts load.

## Refining an existing drawing

1. `describe` and note ids.
2. Change by id: `update api --set '{"width":220}'`, `delete old-arrow`, or one `apply` patch.
3. Do not delete and recreate a shape just to move or resize it: bound arrows follow it.
4. Preserve unrelated styling and wording unless the user asked for a redesign.
5. `save` when the screenshot passes.
