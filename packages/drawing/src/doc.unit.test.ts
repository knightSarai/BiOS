import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import {
  applyChanges,
  copyDrawing,
  drawingOf,
  ensureDrawing,
  pruneDrawings,
  readShapes,
  restoreDrawing,
} from "./doc"
import { arrow, box } from "./test-shapes"

const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
}

describe("drawing storage", () => {
  it("round-trips shapes in z order", () => {
    const ydoc = new Y.Doc()
    const drawing = ensureDrawing(ydoc, "d1")
    applyChanges(
      drawing,
      [
        { type: "add", shape: arrow("x", "a", null) },
        { type: "add", shape: box("a", 0, 0) },
      ],
      null
    )
    expect(readShapes(drawingOf(ydoc, "d1")).map((shape) => shape.id)).toEqual([
      "a",
      "x",
    ])
  })

  it("keeps both devices' edits to different fields of one shape", () => {
    const phone = new Y.Doc()
    const laptop = new Y.Doc()
    applyChanges(
      ensureDrawing(phone, "d1"),
      [{ type: "add", shape: box("a", 0, 0) }],
      null
    )
    sync(phone, laptop)
    applyChanges(
      ensureDrawing(phone, "d1"),
      [{ type: "update", id: "a", fields: { x: 40 } }],
      null
    )
    applyChanges(
      ensureDrawing(laptop, "d1"),
      [{ type: "update", id: "a", fields: { fill: "chart-4" } }],
      null
    )
    sync(phone, laptop)
    for (const ydoc of [phone, laptop]) {
      expect(readShapes(drawingOf(ydoc, "d1"))[0]).toMatchObject({
        x: 40,
        fill: "chart-4",
      })
    }
  })

  it("skips shapes that don't parse", () => {
    const ydoc = new Y.Doc()
    const drawing = ensureDrawing(ydoc, "d1")
    applyChanges(drawing, [{ type: "add", shape: box("a", 0, 0) }], null)
    const broken = new Y.Map<unknown>()
    broken.set("kind", "rect")
    drawing.set("broken", broken)
    expect(readShapes(drawing).map((shape) => shape.id)).toEqual(["a"])
  })

  it("removes shapes and ignores updates to missing ones", () => {
    const ydoc = new Y.Doc()
    const drawing = ensureDrawing(ydoc, "d1")
    applyChanges(drawing, [{ type: "add", shape: box("a", 0, 0) }], null)
    applyChanges(
      drawing,
      [
        { type: "remove", id: "a" },
        { type: "update", id: "ghost", fields: { x: 1 } },
      ],
      null
    )
    expect(readShapes(drawing)).toEqual([])
  })

  it("tags writes with the origin so an undo manager can track them", () => {
    const ydoc = new Y.Doc()
    const drawing = ensureDrawing(ydoc, "d1")
    const origin = { name: "editor" }
    const undo = new Y.UndoManager(drawing, {
      trackedOrigins: new Set([origin]),
    })
    applyChanges(drawing, [{ type: "add", shape: box("a", 0, 0) }], origin)
    applyChanges(drawing, [{ type: "add", shape: box("b", 0, 0) }], "elsewhere")
    undo.undo()
    expect(readShapes(drawing).map((shape) => shape.id)).toEqual(["b"])
  })

  it("copies a drawing so the copy edits independently", () => {
    const ydoc = new Y.Doc()
    applyChanges(
      ensureDrawing(ydoc, "original"),
      [{ type: "add", shape: box("a", 0, 0) }],
      null
    )
    copyDrawing(ydoc, "original", "copy")
    applyChanges(
      ensureDrawing(ydoc, "copy"),
      [{ type: "update", id: "a", fields: { x: 99 } }],
      null
    )
    expect(readShapes(drawingOf(ydoc, "original"))[0]).toMatchObject({ x: 0 })
    expect(readShapes(drawingOf(ydoc, "copy"))[0]).toMatchObject({ x: 99 })
  })

  it("prunes drawings no block points to", () => {
    const ydoc = new Y.Doc()
    ensureDrawing(ydoc, "keep")
    ensureDrawing(ydoc, "gone")
    pruneDrawings(ydoc, new Set(["keep"]))
    expect(drawingOf(ydoc, "gone")).toBeUndefined()
    expect(drawingOf(ydoc, "keep")).toBeDefined()
  })
})

describe("restoreDrawing", () => {
  it("rebuilds a drawing from a clipboard snapshot", () => {
    const ydoc = new Y.Doc()
    restoreDrawing(
      ydoc,
      "pasted",
      JSON.stringify([box("a", 5, 6), arrow("x", "a", null)])
    )
    expect(readShapes(drawingOf(ydoc, "pasted")).map((s) => s.id)).toEqual([
      "a",
      "x",
    ])
  })

  it("drops invalid shapes and ignores snapshots that aren't JSON lists", () => {
    const ydoc = new Y.Doc()
    restoreDrawing(
      ydoc,
      "p1",
      JSON.stringify([box("a", 0, 0), { kind: "rect", x: "nope" }])
    )
    expect(readShapes(drawingOf(ydoc, "p1")).map((s) => s.id)).toEqual(["a"])
    restoreDrawing(ydoc, "p2", "{not json")
    restoreDrawing(ydoc, "p3", JSON.stringify({ shapes: [] }))
    expect(drawingOf(ydoc, "p2")).toBeUndefined()
    expect(drawingOf(ydoc, "p3")).toBeUndefined()
  })
})

describe("applyChanges", () => {
  it("writes nothing when an update changes no value", () => {
    const ydoc = new Y.Doc()
    const drawing = ensureDrawing(ydoc, "d1")
    applyChanges(drawing, [{ type: "add", shape: box("a", 0, 0) }], null)
    const updates: Uint8Array[] = []
    ydoc.on("update", (update: Uint8Array) => updates.push(update))
    applyChanges(
      drawing,
      [{ type: "update", id: "a", fields: { x: 0, label: "" } }],
      null
    )
    expect(updates).toHaveLength(0)
  })

  it("skips entries that aren't shape maps", () => {
    const ydoc = new Y.Doc()
    const loose = new Y.Map<unknown>()
    ydoc.getMap<Y.Map<unknown>>("drawings").set("d1", loose)
    loose.set("stray", "not a map")
    applyChanges(
      ensureDrawing(ydoc, "d1"),
      [{ type: "add", shape: box("a", 0, 0) }],
      null
    )
    expect(readShapes(drawingOf(ydoc, "d1")).map((s) => s.id)).toEqual(["a"])
  })
})
