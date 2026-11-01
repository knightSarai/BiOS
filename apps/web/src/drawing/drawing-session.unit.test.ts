import {
  DEFAULT_SHAPE_STYLE,
  applyChanges,
  createBox,
  drawingOf,
  drawingsOf,
  readShapes,
} from "@knight-os/drawing"
import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import { createDrawingSession } from "./drawing-session"

const box = (id: string) =>
  createBox(
    "rect",
    id,
    1,
    { x: 0, y: 0 },
    { x: 100, y: 50 },
    DEFAULT_SHAPE_STYLE
  )

describe("drawing session", () => {
  it("merges label typing into one undo step", () => {
    const ydoc = new Y.Doc()
    const session = createDrawingSession(ydoc, "d1")
    session.apply([{ type: "add", shape: box("a") }])
    for (const label of ["I", "In", "Inb", "Inbox"]) {
      session.apply([{ type: "update", id: "a", fields: { label } }], {
        typing: true,
      })
    }
    session.undo()
    expect(session.getSnapshot().shapes[0]).toMatchObject({ label: "" })
    session.undo()
    expect(session.getSnapshot().shapes).toEqual([])
    session.destroy()
  })

  it("never undoes changes made outside this editor", () => {
    const ydoc = new Y.Doc()
    const session = createDrawingSession(ydoc, "d1")
    session.apply([{ type: "add", shape: box("mine") }])
    const drawing = drawingOf(ydoc, "d1")
    if (drawing)
      applyChanges(drawing, [{ type: "add", shape: box("theirs") }], "remote")
    session.undo()
    expect(session.getSnapshot().shapes.map((s) => s.id)).toEqual(["theirs"])
    session.destroy()
  })

  it("follows the drawing when another device replaces its map", () => {
    const ydoc = new Y.Doc()
    const session = createDrawingSession(ydoc, "d1")
    const replacement: Y.Map<Y.Map<unknown>> = new Y.Map()
    drawingsOf(ydoc).set("d1", replacement)
    session.apply([{ type: "add", shape: box("a") }])
    expect(readShapes(drawingOf(ydoc, "d1")).map((s) => s.id)).toEqual(["a"])
    expect(session.getSnapshot().shapes.map((s) => s.id)).toEqual(["a"])
    session.destroy()
  })

  it("notifies subscribers until destroyed", () => {
    const ydoc = new Y.Doc()
    const session = createDrawingSession(ydoc, "d1")
    let calls = 0
    session.subscribe(() => calls++)
    session.apply([{ type: "add", shape: box("a") }])
    const afterFirst = calls
    session.destroy()
    const drawing = drawingOf(ydoc, "d1")
    if (drawing) applyChanges(drawing, [{ type: "add", shape: box("b") }], null)
    expect(afterFirst).toBeGreaterThan(0)
    expect(calls).toBe(afterFirst)
  })
})
