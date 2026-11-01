import { describe, expect, it } from "vitest"
import {
  applyToShapes,
  createBox,
  createText,
  duplicateChanges,
  labelChange,
  moveChanges,
  nextZ,
  offsetShapes,
  removeChanges,
  reorderChanges,
  resizeChange,
  restyleChanges,
  withBoundEnds,
} from "./commands"
import { arrowSegment, boxesById } from "./geometry"
import { DEFAULT_SHAPE_STYLE } from "./shapes"
import { arrow, box } from "./test-shapes"

describe("createBox", () => {
  it("normalizes a box dragged up and to the left", () => {
    const shape = createBox(
      "rect",
      "r",
      1,
      { x: 200, y: 150 },
      { x: 100, y: 50 },
      DEFAULT_SHAPE_STYLE
    )
    expect(shape).toMatchObject({ x: 100, y: 50, w: 100, h: 100 })
  })

  it("uses a default size for a click", () => {
    const shape = createBox(
      "ellipse",
      "e",
      1,
      { x: 200, y: 150 },
      { x: 202, y: 151 },
      DEFAULT_SHAPE_STYLE
    )
    expect(shape).toMatchObject({
      x: 130,
      y: 118,
      w: 140,
      h: 64,
      kind: "ellipse",
    })
  })
})

describe("moveChanges", () => {
  it("moves boxes and lets attached arrows follow without writing to them", () => {
    const shapes = [box("a", 0, 0), box("b", 300, 0), arrow("x", "a", "b")]
    const changes = moveChanges(shapes, new Set(["b"]), 0, 100)
    expect(changes).toEqual([
      { type: "update", id: "b", fields: { x: 300, y: 100 } },
    ])
    const moved = applyToShapes(shapes, changes)
    const segment = arrowSegment(arrow("x", "a", "b"), boxesById(moved))
    expect(segment.y2).toBeGreaterThan(segment.y1)
  })

  it("moves only the free ends of a selected arrow", () => {
    const shapes = [
      box("a", 0, 0),
      arrow("x", "a", null, { x1: 0, y1: 0, x2: 400, y2: 0 }),
    ]
    const [change] = moveChanges(shapes, new Set(["x"]), 10, 20)
    expect(change).toEqual({
      type: "update",
      id: "x",
      fields: {
        start: { shapeId: "a", x: 0, y: 0 },
        end: { shapeId: null, x: 410, y: 20 },
      },
    })
  })
})

describe("resizeChange", () => {
  it("keeps the opposite corner fixed", () => {
    const change = resizeChange(box("a", 100, 100, 100, 50), "nw", {
      x: 50,
      y: 80,
    })
    expect(change).toEqual({
      type: "update",
      id: "a",
      fields: { x: 50, y: 80, w: 150, h: 70 },
    })
  })

  it("flips when dragged past the opposite corner and keeps a minimum size", () => {
    const change = resizeChange(box("a", 100, 100, 100, 50), "se", {
      x: 95,
      y: 100,
    })
    expect(change).toEqual({
      type: "update",
      id: "a",
      fields: { x: 84, y: 100, w: 16, h: 16 },
    })
  })
})

describe("removeChanges", () => {
  it("detaches arrows from a removed shape where they ended", () => {
    const shapes = [box("a", 0, 0), box("b", 300, 0), arrow("x", "a", "b")]
    const result = applyToShapes(shapes, removeChanges(shapes, new Set(["b"])))
    expect(result.map((shape) => shape.id)).toEqual(["a", "x"])
    const kept = result.find((shape) => shape.id === "x")
    expect(kept).toMatchObject({
      end: { shapeId: null, x: 292, y: 25 },
      start: { shapeId: "a" },
    })
  })
})

describe("restyleChanges", () => {
  it("only sets fields that apply to each kind", () => {
    const text = {
      ...box("t", 0, 0),
      kind: "text" as const,
      text: "Hi",
      size: "m" as const,
    }
    const { fill: _fill, label: _label, w: _w, h: _h, ...textShape } = text
    const shapes = [box("a", 0, 0), textShape]
    const changes = restyleChanges(shapes, new Set(["a", "t"]), {
      fill: "chart-3",
      width: 4,
    })
    expect(changes).toEqual([
      { type: "update", id: "a", fields: { fill: "chart-3", width: 4 } },
    ])
  })
})

describe("labelChange", () => {
  it("edits a box label and a text's text", () => {
    expect(labelChange(box("a", 0, 0), "Inbox")).toEqual({
      type: "update",
      id: "a",
      fields: { label: "Inbox" },
    })
  })
})

describe("reorderChanges", () => {
  it("brings selected shapes to the front in their current order", () => {
    const shapes = [
      { ...box("a", 0, 0), z: 1 },
      { ...box("b", 0, 0), z: 2 },
      { ...box("c", 0, 0), z: 3 },
    ]
    const result = applyToShapes(
      shapes,
      reorderChanges(shapes, new Set(["a", "b"]), "front")
    )
    expect(result.map((shape) => shape.id)).toEqual(["c", "a", "b"])
  })

  it("sends selected shapes to the back", () => {
    const shapes = [
      { ...box("a", 0, 0), z: 1 },
      { ...box("b", 0, 0), z: 2 },
    ]
    const result = applyToShapes(
      shapes,
      reorderChanges(shapes, new Set(["b"]), "back")
    )
    expect(result.map((shape) => shape.id)).toEqual(["b", "a"])
  })
})

describe("duplicateChanges", () => {
  it("offsets copies, puts them on top and reattaches copied arrows to the copies", () => {
    const shapes = [box("a", 0, 0), box("b", 300, 0), arrow("x", "a", "b")]
    let counter = 0
    const { changes, ids } = duplicateChanges(
      shapes,
      new Set(["a", "x"]),
      () => `copy-${++counter}`
    )
    const result = applyToShapes(shapes, changes)
    expect(ids).toEqual(["copy-1", "copy-2"])
    expect(result.find((shape) => shape.id === "copy-1")).toMatchObject({
      x: 24,
      y: 24,
    })
    const copiedArrow = result.find((shape) => shape.id === "copy-2")
    expect(copiedArrow).toMatchObject({
      start: { shapeId: "copy-1" },
      end: { shapeId: null },
    })
    expect(
      Math.min(...changes.map((c) => (c.type === "add" ? c.shape.z : 0)))
    ).toBe(nextZ(shapes))
  })
})

describe("applyToShapes", () => {
  it("ignores an update that would make a shape invalid", () => {
    const shapes = [box("a", 0, 0)]
    const result = applyToShapes(shapes, [
      { type: "update", id: "a", fields: { w: -5 } },
    ])
    expect(result[0]).toEqual(shapes[0])
  })
})

describe("new shapes", () => {
  it("take the given style and start text empty", () => {
    const style = {
      ...DEFAULT_SHAPE_STYLE,
      stroke: "chart-2" as const,
      rough: true,
    }
    const text = createText("t", 1, { x: 0, y: 0 }, style)
    expect(text).toMatchObject({ text: "", stroke: "chart-2", rough: true })
    expect("fill" in text).toBe(false)
  })
})

describe("withBoundEnds", () => {
  it("records where a moved shape's arrows now meet it", () => {
    const shapes = [box("a", 0, 0), box("b", 300, 0), arrow("x", "a", "b")]
    const changes = withBoundEnds(
      shapes,
      moveChanges(shapes, new Set(["b"]), 0, 200)
    )
    const updated = applyToShapes(shapes, changes).find((s) => s.id === "x")
    const segment = arrowSegment(
      arrow("x", "a", "b"),
      boxesById(applyToShapes(shapes, changes))
    )
    expect(updated).toMatchObject({
      start: { shapeId: "a", x: segment.x1, y: segment.y1 },
      end: { shapeId: "b", x: segment.x2, y: segment.y2 },
    })
  })

  it("leaves arrows of unmoved shapes alone", () => {
    const shapes = [
      box("a", 0, 0),
      box("b", 300, 0),
      box("c", 0, 300),
      arrow("x", "a", "b"),
    ]
    const changes = moveChanges(shapes, new Set(["c"]), 10, 10)
    expect(withBoundEnds(shapes, changes)).toEqual(changes)
  })
})

describe("offsetShapes", () => {
  it("shifts a whole set, keeping arrows attached", () => {
    const shapes = [box("a", 0, 0), box("b", 300, 0), arrow("x", "a", "b")]
    const moved = offsetShapes(shapes, 100, 50)
    expect(moved.find((s) => s.id === "b")).toMatchObject({ x: 400, y: 50 })
    expect(moved.find((s) => s.id === "x")).toMatchObject({
      start: { shapeId: "a" },
      end: { shapeId: "b" },
    })
  })
})

describe("offsetShapes and attached arrows", () => {
  it("stores the moved meeting points on attached arrow ends", () => {
    const shapes = [box("a", 0, 0), box("b", 300, 0), arrow("x", "a", "b")]
    const moved = offsetShapes(shapes, 1000, 0).find((s) => s.id === "x")
    expect(moved).toMatchObject({
      start: { shapeId: "a", x: 1106 },
      end: { shapeId: "b", x: 1292 },
    })
  })
})
