import { isBox, TEXT_SIZES } from "./shapes"
import type { ArrowShape, BoxShape, Shape, TextShape } from "./shapes"

type Point = { x: number; y: number }
type Box = { x: number; y: number; w: number; h: number }
type Segment = { x1: number; y1: number; x2: number; y2: number }
type Camera = { x: number; y: number; zoom: number }

const ARROW_START_GAP = 6
const ARROW_END_GAP = 8

const boxesById = (shapes: readonly Shape[]) =>
  new Map(
    shapes.flatMap((shape): [string, BoxShape][] =>
      isBox(shape) ? [[shape.id, shape]] : []
    )
  )

const centerOf = (box: Box): Point => ({
  x: box.x + box.w / 2,
  y: box.y + box.h / 2,
})

// Where the line from the shape's centre towards `toward` leaves its outline.
const edgePoint = (shape: BoxShape, toward: Point, gap: number): Point => {
  const center = centerOf(shape)
  const dx = toward.x - center.x
  const dy = toward.y - center.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return center
  const hw = shape.w / 2
  const hh = shape.h / 2
  const t =
    shape.kind === "ellipse"
      ? 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh))
      : shape.kind === "diamond"
        ? 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh)
        : Math.min(hw / Math.abs(dx), hh / Math.abs(dy))
  const scale = t + gap / length
  return { x: center.x + dx * scale, y: center.y + dy * scale }
}

const arrowSegment = (
  arrow: ArrowShape,
  boxes: ReadonlyMap<string, BoxShape>
): Segment => {
  const from = arrow.start.shapeId ? boxes.get(arrow.start.shapeId) : undefined
  const to = arrow.end.shapeId ? boxes.get(arrow.end.shapeId) : undefined
  const startAim = to ? centerOf(to) : arrow.end
  const start = from ? edgePoint(from, startAim, ARROW_START_GAP) : arrow.start
  const end = to ? edgePoint(to, start, ARROW_END_GAP) : arrow.end
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
}

// An estimate: real text metrics differ per platform and font, so hit areas
// and label backgrounds are sized from character counts.
const textBoxSize = (text: string, size: number) => {
  const lines = text.split("\n")
  const longest = Math.max(1, ...lines.map((line) => line.length))
  return {
    w: Math.max(size, longest * size * 0.56),
    h: lines.length * size * 1.3,
    lines: lines.length,
  }
}

const textBox = (shape: TextShape): Box => {
  const { w, h } = textBoxSize(shape.text, TEXT_SIZES[shape.size])
  return { x: shape.x, y: shape.y, w, h }
}

const boundsOf = (shape: Shape, boxes: ReadonlyMap<string, BoxShape>): Box => {
  switch (shape.kind) {
    case "rect":
    case "ellipse":
    case "diamond":
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
    case "text":
      return textBox(shape)
    case "pen": {
      const xs = shape.points.map(([x]) => x)
      const ys = shape.points.map(([, y]) => y)
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
    }
    case "arrow": {
      const s = arrowSegment(shape, boxes)
      return {
        x: Math.min(s.x1, s.x2),
        y: Math.min(s.y1, s.y2),
        w: Math.abs(s.x2 - s.x1),
        h: Math.abs(s.y2 - s.y1),
      }
    }
  }
}

const unionOf = (boxes: readonly Box[]): Box | null => {
  if (boxes.length === 0) return null
  const x0 = Math.min(...boxes.map((b) => b.x))
  const y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.w))
  const y1 = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const drawingBounds = (shapes: readonly Shape[]) => {
  const boxes = boxesById(shapes)
  return unionOf(shapes.map((shape) => boundsOf(shape, boxes)))
}

const distanceToSegment = (p: Point, s: Segment) => {
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / lengthSquared)
        )
  return Math.hypot(p.x - (s.x1 + t * dx), p.y - (s.y1 + t * dy))
}

const contains = (box: Box, p: Point, margin: number) =>
  p.x >= box.x - margin &&
  p.x <= box.x + box.w + margin &&
  p.y >= box.y - margin &&
  p.y <= box.y + box.h + margin

const hitTest = (
  shapes: readonly Shape[],
  p: Point,
  tolerance: number
): Shape | null => {
  const boxes = boxesById(shapes)
  for (const shape of [...shapes].reverse()) {
    const hit =
      shape.kind === "arrow"
        ? distanceToSegment(p, arrowSegment(shape, boxes)) <= tolerance
        : contains(boundsOf(shape, boxes), p, tolerance)
    if (hit) return shape
  }
  return null
}

const boxAt = (
  shapes: readonly Shape[],
  p: Point,
  excludeId: string | null
): BoxShape | null =>
  [...shapes]
    .reverse()
    .filter(isBox)
    .find((shape) => shape.id !== excludeId && contains(shape, p, 0)) ?? null

const intersects = (a: Box, b: Box) =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h

const shapesInBox = (shapes: readonly Shape[], area: Box) => {
  const boxes = boxesById(shapes)
  return shapes.filter((shape) => intersects(area, boundsOf(shape, boxes)))
}

const fitCamera = (
  bounds: Box,
  viewport: { w: number; h: number },
  padding: number,
  maxZoom: number
): Camera => {
  const zoom = Math.max(
    0.1,
    Math.min(
      maxZoom,
      (viewport.w - padding * 2) / Math.max(bounds.w, 1),
      (viewport.h - padding * 2) / Math.max(bounds.h, 1)
    )
  )
  return {
    zoom,
    x: (viewport.w - bounds.w * zoom) / 2 - bounds.x * zoom,
    y: (viewport.h - bounds.h * zoom) / 2 - bounds.y * zoom,
  }
}

const toWorld = (camera: Camera, screen: Point): Point => ({
  x: (screen.x - camera.x) / camera.zoom,
  y: (screen.y - camera.y) / camera.zoom,
})

const zoomAround = (camera: Camera, screen: Point, zoom: number): Camera => {
  const world = toWorld(camera, screen)
  return {
    zoom,
    x: screen.x - world.x * zoom,
    y: screen.y - world.y * zoom,
  }
}

export {
  arrowSegment,
  boundsOf,
  boxAt,
  boxesById,
  centerOf,
  distanceToSegment,
  drawingBounds,
  edgePoint,
  fitCamera,
  hitTest,
  shapesInBox,
  textBoxSize,
  toWorld,
  unionOf,
  zoomAround,
}
export type { Box, Camera, Point, Segment }
