import { describe, expect, it } from "vitest"
import {
  arrowSegment,
  boxesById,
  drawingBounds,
  edgePoint,
  fitCamera,
  hitTest,
  toWorld,
  zoomAround,
} from "./geometry"
import { arrow, box } from "./test-shapes"

describe("edgePoint", () => {
  it("leaves a rectangle through the side facing the target", () => {
    const rect = box("a", 0, 0, 100, 50)
    expect(edgePoint(rect, { x: 500, y: 25 }, 0)).toEqual({ x: 100, y: 25 })
    expect(edgePoint(rect, { x: 50, y: -400 }, 0)).toEqual({ x: 50, y: 0 })
  })

  it("follows the outline of ellipses and diamonds", () => {
    const ellipse = box("e", 0, 0, 100, 50, "ellipse")
    const diamond = box("d", 0, 0, 100, 50, "diamond")
    const right = { x: 500, y: 25 }
    expect(edgePoint(ellipse, right, 0).x).toBeCloseTo(100)
    expect(edgePoint(diamond, right, 0).x).toBeCloseTo(100)
    const corner = edgePoint(diamond, { x: 100, y: 75 }, 0)
    expect(
      Math.abs(corner.x - 50) / 50 + Math.abs(corner.y - 25) / 25
    ).toBeCloseTo(1)
  })

  it("adds the gap beyond the outline", () => {
    expect(edgePoint(box("a", 0, 0), { x: 500, y: 25 }, 8)).toEqual({
      x: 108,
      y: 25,
    })
  })
})

describe("arrowSegment", () => {
  it("runs between the edges of the shapes it connects", () => {
    const shapes = [box("a", 0, 0), box("b", 300, 0), arrow("x", "a", "b")]
    const segment = arrowSegment(arrow("x", "a", "b"), boxesById(shapes))
    expect(segment).toEqual({ x1: 106, y1: 25, x2: 292, y2: 25 })
  })

  it("keeps a free end where it was dropped", () => {
    const shapes = [box("a", 0, 0)]
    const free = arrow("x", "a", null, { x1: 0, y1: 0, x2: 400, y2: 25 })
    expect(arrowSegment(free, boxesById(shapes))).toEqual({
      x1: 106,
      y1: 25,
      x2: 400,
      y2: 25,
    })
  })

  it("treats an end whose shape is gone as free", () => {
    const orphan = arrow("x", "missing", null, {
      x1: 5,
      y1: 6,
      x2: 50,
      y2: 60,
    })
    expect(arrowSegment(orphan, new Map())).toEqual({
      x1: 5,
      y1: 6,
      x2: 50,
      y2: 60,
    })
  })
})

describe("hitTest", () => {
  const shapes = [
    { ...box("below", 0, 0, 200, 200), z: 1 },
    { ...box("above", 50, 50, 50, 50), z: 2 },
    arrow("line", null, null, { x1: 300, y1: 0, x2: 400, y2: 0 }),
  ]

  it("returns the topmost shape under the point", () => {
    expect(hitTest(shapes, { x: 60, y: 60 }, 0)?.id).toBe("above")
    expect(hitTest(shapes, { x: 10, y: 10 }, 0)?.id).toBe("below")
  })

  it("hits arrows within the tolerance of their line", () => {
    expect(hitTest(shapes, { x: 350, y: 5 }, 6)?.id).toBe("line")
    expect(hitTest(shapes, { x: 350, y: 20 }, 6)).toBeNull()
  })
})

describe("camera", () => {
  it("fits a drawing's bounds inside the viewport", () => {
    const bounds = drawingBounds([box("a", 100, 100, 200, 100)])
    expect(bounds).toEqual({ x: 100, y: 100, w: 200, h: 100 })
    const camera = fitCamera(
      bounds ?? { x: 0, y: 0, w: 1, h: 1 },
      { w: 500, h: 300 },
      50,
      4
    )
    expect(camera.zoom).toBe(2)
    expect(toWorld(camera, { x: 250, y: 150 })).toEqual({ x: 200, y: 150 })
  })

  it("has no bounds for an empty drawing", () => {
    expect(drawingBounds([])).toBeNull()
  })

  it("zooms around a fixed screen point", () => {
    const camera = { x: 10, y: 20, zoom: 1 }
    const zoomed = zoomAround(camera, { x: 100, y: 100 }, 2)
    expect(toWorld(zoomed, { x: 100, y: 100 })).toEqual(
      toWorld(camera, { x: 100, y: 100 })
    )
  })
})
