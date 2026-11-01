import type { ArrowShape, BoxKind, BoxShape } from "./shapes"

const box = (
  id: string,
  x: number,
  y: number,
  w = 100,
  h = 50,
  kind: BoxKind = "rect"
): BoxShape => ({
  id,
  z: 1,
  kind,
  x,
  y,
  w,
  h,
  stroke: "foreground",
  width: 2,
  dashed: false,
  rough: false,
  fill: null,
  label: "",
})

const arrow = (
  id: string,
  from: string | null,
  to: string | null,
  points = { x1: 0, y1: 0, x2: 10, y2: 0 }
): ArrowShape => ({
  id,
  z: 2,
  kind: "arrow",
  start: { shapeId: from, x: points.x1, y: points.y1 },
  end: { shapeId: to, x: points.x2, y: points.y2 },
  stroke: "foreground",
  width: 2,
  dashed: false,
  rough: false,
  label: "",
})

export { arrow, box }
