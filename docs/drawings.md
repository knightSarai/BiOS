# Drawings: v1 plan

Draft, 2026-11-01. Inputs: a hands-on test of Linear's Mermaid diagrams, the Excalidraw 0.18 docs, [obsidian-inventory.md](obsidian-inventory.md) (13 Excalidraw drawings), and the decision to build the mobile app natively with React Native and Expo.

**Summary:** Documents get two kinds of diagram. Mermaid covers diagrams you describe in text and is built (the `mermaid` block). Drawings cover what you would sketch on a whiteboard, and we build them in-house. Excalidraw only runs in a browser, so a native app would need a WebView to edit or show a drawing. Our own drawing is a small shape model stored in the document's Y.Doc. The same model renders as SVG on the web and through `react-native-svg` on mobile, and Yjs merges edits shape by shape. The decisions at the end need your call before we build.

## How it fits what exists

```
Document Y.Doc
├── content          XmlFragment, the ProseMirror blocks
│   └── drawing      block node { id, drawingId }
├── diagramPreviews  Map: Mermaid block id → cached light/dark SVG
└── drawings         Map: drawingId → drawing (shapes, see below)
```

- A drawing block in the text holds only `{ id, drawingId }`. The shapes live beside the text in the same Y.Doc, so they sync, persist (y-dexie) and travel with the document.
- Mermaid needs a cached SVG because native code can't run Mermaid. Drawings don't need one: every client renders the shapes itself.
- The document's undo history covers the text only, the same scope as the Mermaid previews. A drawing gets its own `Y.UndoManager` scoped to its map, so undo inside the editor undoes strokes, not paragraphs.

## Shape model

Each shape is a `Y.Map`, so two devices that change different fields (one moves a box, the other recolours it) both keep their change.

```ts
type ShapeBase = {
  id: string
  z: string // fractional index: reorder without moving array items
  stroke: DrawingColor
  strokeWidth: 1 | 2 | 4
  strokeStyle: "solid" | "dashed"
}

type Shape =
  | (ShapeBase & {
      kind: "rect" | "ellipse" | "diamond"
      x: number; y: number; w: number; h: number
      fill: DrawingColor | null
      label: string
    })
  | (ShapeBase & {
      kind: "arrow"
      start: { shapeId: string | null; x: number; y: number }
      end: { shapeId: string | null; x: number; y: number }
      heads: "end" | "both" | "none"
      label: string
    })
  | (ShapeBase & { kind: "text"; x: number; y: number; text: string; size: "s" | "m" | "l" })
  | (ShapeBase & { kind: "pen"; points: [x: number, y: number, pressure: number][] })

type DrawingColor = "foreground" | "muted" | "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5"
```

```
drawings: Y.Map
└── <drawingId>: Y.Map
    ├── shapes: Y.Map<shapeId, Y.Map<Shape fields>>
    └── view: { x, y, zoom }   last camera, per drawing
```

- Colours are token names, not hex. Each platform maps them to its light or dark value, so a drawing follows the theme. The area colours (`chart-1`…`chart-5`) give the palette.
- A pen stroke is written once when the finger lifts, so its points are a plain array, not a `Y.Array`.
- An arrow attached to a shape stores the shape id. Moving the shape moves the arrow end at render time, without writing to the arrow.

## Shared code with mobile

A pure TypeScript package (`packages/drawing`) holds everything that isn't pixels:

| Part | What it does |
| --- | --- |
| Model | Read and write shapes on a `Y.Map`, fractional z-order, ids |
| Geometry | Bounds, arrow routing to a shape's edge, label layout boxes |
| Hit testing | Which shape is under a point, which shapes a marquee covers |
| Commands | Add, move, resize, recolour, delete, bring forward, as pure functions over the model |
| Render tree | Shapes → a list of SVG primitives (`path`, `rect`, `text`) with resolved colours |

The web turns the render tree into `<svg>` elements. React Native turns the same tree into `react-native-svg` components (15.16). Either way only a thin layer differs. Pen strokes use `perfect-freehand` (MIT, 1.2.3), which outputs a polygon both renderers can draw. The geometry and hit testing are pure functions, so they get thorough unit tests.

## v1 scope

**In the document**
- `/drawing` (slash menu, aliases `sketch`, `whiteboard`) inserts a drawing block, and the editor opens on it at once.
- The block shows the drawing fitted to its width. Tapping it opens the editor.

**In the editor**

| Area | v1 |
| --- | --- |
| Tools | Select, rectangle, ellipse, diamond, arrow, text, pen |
| Editing | Move, resize from 8 handles, multi-select with shift or a marquee, duplicate, delete, a label typed into a shape |
| Style | Stroke and fill from the token palette, three stroke widths, solid or dashed |
| Arrows | Snap their ends to a shape's edge and follow it when it moves |
| Canvas | Infinite canvas with pan and zoom, and zoom to fit |
| Undo | Undo and redo inside the drawing |
| Touch | One finger uses the current tool, two fingers pan and zoom, a long press opens the shape menu. Pressure from a stylus feeds the pen. |
| Keyboard | V R O D A T P for the tools, Delete, Mod-D, Mod-Z, Escape |

**Not in v1:** rotation, grouping, alignment guides, images inside drawings (needs attachments, G5), elbow arrows, a hand-drawn look, a shape library, comments on shapes, exporting PNG.

## Importing the Obsidian drawings

The Obsidian Excalidraw plugin saves `.excalidraw.md` files with the scene as (often compressed) JSON. An importer can convert the parts that match:

| Excalidraw | knight-os |
| --- | --- |
| `rectangle`, `ellipse`, `diamond` | same kind |
| `arrow`, `line` with `startBinding`/`endBinding` | `arrow` with `shapeId` |
| `text` bound to a container | that shape's `label` |
| `text` on its own | `text` |
| `freedraw` | `pen` |
| colours | nearest palette token |
| `image`, `frame`, anything else | dropped, with a note in the import report |

If a drawing loses too much in conversion, it imports as an image attachment instead, which is the plan the inventory already set out.

## Decisions for you

Each decision gives its options. "Lean" marks my suggestion; the choice is yours.

### DR1. Where a drawing lives

- **A. In the document's Y.Doc** (`drawings` map), keyed by `drawingId`. It syncs and gets deleted with its document. *Lean.*
- **B. Its own record** (Dexie row with its own Y.Doc). The same drawing could appear in several documents, but every document would need a second sync channel.

### DR2. Where you edit

- **A. A full-screen editor** opened from the block, with an inline preview in the document. On a phone this is the only workable layout. *Lean.*
- **B. Inline in the document flow.** The canvas competes with the page for scroll and touch gestures.

### DR3. Look

- **A. Clean lines** in the app's own style. *Lean* for v1.
- **B. Hand-drawn** through `roughjs` (MIT, 4.6.6, last released 2023). It works on both platforms because it outputs path data. It could become a per-drawing style later.

### DR4. Colours

- **A. Palette tokens** that adapt to light and dark. *Lean.*
- **B. Any hex colour.** It looks wrong in one of the two themes unless you pick twice.

### DR5. Where the shared code lives

- **A. `packages/drawing` now**, used by the web and later by the app. *Lean.*
- **B. Inside `apps/web`**, moved out when the app starts. This is faster today but needs a move later.

### DR6. Undo scope

- **A. Per drawing** with its own `Y.UndoManager`, while the editor is open. *Lean.*
- **B. The document's undo** reaches into drawings. Mod-Z in the text could then undo a stroke you can't see.

## Suggested build order

1. **Model and geometry** (`packages/drawing`): shapes on a `Y.Map`, z-order, bounds, hit testing, arrow routing, render tree. Unit tests.
2. **Read-only block:** the `drawing` node, a fitted SVG preview, the slash item, pruning of drawings whose block is gone.
3. **Editor shell:** the full-screen dialog, camera pan and zoom, select and move, undo. Desktop and touch.
4. **Tools:** shapes, text and labels, arrows with attachment, pen, style panel.
5. **Import** of the Obsidian drawings.

Each step ships with tests. The model and geometry get unit tests, and inserting, editing and reopening a drawing gets an end-to-end test.
