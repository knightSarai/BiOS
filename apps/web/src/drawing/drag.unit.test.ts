import {
  DEFAULT_SHAPE_STYLE,
  applyToShapes,
  arrowSegment,
  boxesById,
} from "@knight-os/drawing"
import type { BoxShape } from "@knight-os/drawing"
import { describe, expect, it } from "vitest"
import { committedChanges, dragChanges } from "./drag"

const box = (id: string, x: number, y: number): BoxShape => ({
  id,
  z: 1,
  kind: "rect",
  x,
  y,
  w: 100,
  h: 50,
  stroke: "foreground",
  width: 2,
  dashed: false,
  rough: false,
  fill: null,
  label: "",
})

const shapes = [box("a", 0, 0), box("b", 300, 0)]

describe("dragChanges", () => {
  it("previews a move without touching unselected shapes", () => {
    const changes = dragChanges(
      {
        mode: "move",
        ids: new Set(["a"]),
        start: { x: 10, y: 10 },
        current: { x: 30, y: 15 },
      },
      shapes
    )
    expect(changes).toEqual([
      { type: "update", id: "a", fields: { x: 20, y: 5 } },
    ])
  })

  it("attaches a new arrow to the box under the pointer", () => {
    const [change] = dragChanges(
      {
        mode: "arrow",
        id: "x",
        style: DEFAULT_SHAPE_STYLE,
        fromId: "a",
        start: { x: 50, y: 25 },
        current: { x: 350, y: 25 },
      },
      shapes
    )
    expect(change).toMatchObject({
      type: "add",
      shape: { kind: "arrow", start: { shapeId: "a" }, end: { shapeId: "b" } },
    })
    const drawn = applyToShapes(shapes, change ? [change] : [])
    const arrow = drawn.find((shape) => shape.id === "x")
    expect(
      arrow?.kind === "arrow" ? arrowSegment(arrow, boxesById(drawn)).x2 : 0
    ).toBe(292)
  })

  it("stacks a new box above everything", () => {
    const [change] = dragChanges(
      {
        mode: "create",
        kind: "diamond",
        style: DEFAULT_SHAPE_STYLE,
        id: "n",
        start: { x: 0, y: 0 },
        current: { x: 40, y: 40 },
      },
      [{ ...box("a", 0, 0), z: 7 }]
    )
    expect(change).toMatchObject({
      shape: { kind: "diamond", z: 8, w: 40, h: 40 },
    })
  })

  it("previews nothing while panning", () => {
    expect(
      dragChanges(
        {
          mode: "pan",
          startScreen: { x: 0, y: 0 },
          startCamera: { x: 0, y: 0, zoom: 1 },
        },
        shapes
      )
    ).toEqual([])
  })
})

describe("committedChanges", () => {
  it("drops a click that didn't move anything", () => {
    expect(
      committedChanges(
        {
          mode: "move",
          ids: new Set(["a"]),
          start: { x: 5, y: 5 },
          current: { x: 5, y: 5 },
        },
        shapes
      )
    ).toEqual([])
  })

  it("drops a short arrow that connects nothing", () => {
    expect(
      committedChanges(
        {
          mode: "arrow",
          id: "x",
          style: DEFAULT_SHAPE_STYLE,
          fromId: null,
          start: { x: 500, y: 500 },
          current: { x: 504, y: 500 },
        },
        shapes
      )
    ).toEqual([])
  })

  it("keeps a short arrow that lands on a box", () => {
    expect(
      committedChanges(
        {
          mode: "arrow",
          id: "x",
          style: DEFAULT_SHAPE_STYLE,
          fromId: null,
          start: { x: 290, y: 25 },
          current: { x: 305, y: 25 },
        },
        shapes
      )
    ).toHaveLength(1)
  })
})

describe("committedChanges after a move", () => {
  it("records where attached arrows now meet the moved shape", () => {
    const withArrow = [
      ...shapes,
      {
        id: "x",
        z: 2,
        kind: "arrow" as const,
        start: { shapeId: "a", x: 0, y: 0 },
        end: { shapeId: "b", x: 0, y: 0 },
        stroke: "foreground" as const,
        width: 2 as const,
        dashed: false,
        rough: false,
        label: "",
      },
    ]
    const changes = committedChanges(
      {
        mode: "move",
        ids: new Set(["b"]),
        start: { x: 0, y: 0 },
        current: { x: 0, y: 100 },
      },
      withArrow
    )
    expect(
      changes.map((change) => (change.type === "update" ? change.id : ""))
    ).toEqual(["b", "x"])
  })
})
