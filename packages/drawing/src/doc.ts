import * as Y from "yjs"
import { byZ } from "./commands"
import type { ShapeChange } from "./commands"
import { z } from "zod"
import { shapeSchema } from "./shapes"
import type { Shape } from "./shapes"

const DRAWINGS = "drawings"

// Each shape is its own Y.Map so two devices editing different fields of the
// same shape (one moves it, one recolours it) both keep their change.
type ShapeMap = Y.Map<unknown>
type DrawingMap = Y.Map<ShapeMap>

const drawingsOf = (ydoc: Y.Doc) => ydoc.getMap<DrawingMap>(DRAWINGS)

const drawingOf = (ydoc: Y.Doc, drawingId: string) =>
  drawingsOf(ydoc).get(drawingId)

const ensureDrawing = (ydoc: Y.Doc, drawingId: string) => {
  const drawings = drawingsOf(ydoc)
  const existing = drawings.get(drawingId)
  if (existing) return existing
  const drawing: DrawingMap = new Y.Map()
  drawings.set(drawingId, drawing)
  return drawing
}

// Shapes come from other devices, so anything that doesn't parse is skipped
// rather than trusted.
const readShapes = (drawing: DrawingMap | undefined): Shape[] =>
  drawing
    ? [...drawing.values()]
        .flatMap((map: unknown) => {
          if (!(map instanceof Y.Map)) return []
          const parsed = shapeSchema.safeParse(map.toJSON())
          return parsed.success ? [parsed.data] : []
        })
        .sort(byZ)
    : []

const shapeMapOf = (shape: Shape): ShapeMap => {
  const map: ShapeMap = new Y.Map()
  for (const [key, value] of Object.entries(shape)) map.set(key, value)
  return map
}

const applyChanges = (
  drawing: DrawingMap,
  changes: readonly ShapeChange[],
  origin: unknown
) => {
  if (changes.length === 0) return
  const run = () => {
    for (const change of changes) {
      if (change.type === "add") {
        drawing.set(change.shape.id, shapeMapOf(change.shape))
      } else if (change.type === "remove") {
        drawing.delete(change.id)
      } else {
        const map = drawing.get(change.id)
        if (!map) continue
        for (const [key, value] of Object.entries(change.fields)) {
          if (value === undefined) continue
          // Rewriting an equal value would still sync and add an undo step.
          if (JSON.stringify(map.get(key)) === JSON.stringify(value)) continue
          map.set(key, value)
        }
      }
    }
  }
  if (drawing.doc) drawing.doc.transact(run, origin)
  else run()
}

const copyDrawing = (ydoc: Y.Doc, fromId: string, toId: string) => {
  const shapes = readShapes(drawingOf(ydoc, fromId))
  ydoc.transact(() => {
    const target = ensureDrawing(ydoc, toId)
    for (const shape of shapes) target.set(shape.id, shapeMapOf(shape))
  })
}

const snapshotSchema = z.array(z.unknown())

// Clipboard snapshots can come from anywhere, so each shape is validated.
const restoreDrawing = (ydoc: Y.Doc, drawingId: string, snapshot: string) => {
  let raw: unknown
  try {
    raw = JSON.parse(snapshot)
  } catch {
    return
  }
  const entries = snapshotSchema.safeParse(raw)
  if (!entries.success) return
  const shapes = entries.data.flatMap((entry) => {
    const parsed = shapeSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
  ydoc.transact(() => {
    const target = ensureDrawing(ydoc, drawingId)
    for (const shape of shapes) target.set(shape.id, shapeMapOf(shape))
  })
}

const pruneDrawings = (ydoc: Y.Doc, liveIds: ReadonlySet<string>) => {
  const drawings = drawingsOf(ydoc)
  const stale = [...drawings.keys()].filter((id) => !liveIds.has(id))
  if (stale.length === 0) return
  ydoc.transact(() => {
    for (const id of stale) drawings.delete(id)
  })
}

export {
  applyChanges,
  copyDrawing,
  drawingOf,
  drawingsOf,
  ensureDrawing,
  pruneDrawings,
  readShapes,
  restoreDrawing,
}
export type { DrawingMap }
