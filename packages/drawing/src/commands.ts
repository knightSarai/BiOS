import { arrowSegment, boxesById } from "./geometry"
import type { Point } from "./geometry"
import { isBox, shapeSchema } from "./shapes"
import type {
  ArrowEnd,
  ArrowShape,
  BoxKind,
  BoxShape,
  PenShape,
  Shape,
  ShapeFields,
  ShapeStyle,
  TextShape,
} from "./shapes"

type ShapeChange =
  | { type: "add"; shape: Shape }
  | { type: "update"; id: string; fields: ShapeFields }
  | { type: "remove"; id: string }

type Corner = "nw" | "ne" | "sw" | "se"

type StyleFields = Partial<ShapeStyle>

const DEFAULT_BOX_SIZE = { w: 140, h: 64 }
const MIN_DRAG = 8
const MIN_BOX_SIZE = 16
const DUPLICATE_OFFSET = 24

const byZ = (a: Shape, b: Shape) => a.z - b.z || a.id.localeCompare(b.id)

const nextZ = (shapes: readonly Shape[]) =>
  shapes.reduce((max, shape) => Math.max(max, shape.z), 0) + 1

const createBox = (
  kind: BoxKind,
  id: string,
  z: number,
  from: Point,
  to: Point,
  style: ShapeStyle
): BoxShape => {
  const w = Math.abs(to.x - from.x)
  const h = Math.abs(to.y - from.y)
  const dragged = w >= MIN_DRAG && h >= MIN_DRAG
  return {
    ...style,
    id,
    z,
    kind,
    x: dragged ? Math.min(from.x, to.x) : from.x - DEFAULT_BOX_SIZE.w / 2,
    y: dragged ? Math.min(from.y, to.y) : from.y - DEFAULT_BOX_SIZE.h / 2,
    w: dragged ? w : DEFAULT_BOX_SIZE.w,
    h: dragged ? h : DEFAULT_BOX_SIZE.h,
    label: "",
  }
}

const lineStyle = ({ fill: _fill, ...style }: ShapeStyle) => style

const createArrow = (
  id: string,
  z: number,
  start: ArrowEnd,
  end: ArrowEnd,
  style: ShapeStyle
): ArrowShape => ({
  ...lineStyle(style),
  id,
  z,
  kind: "arrow",
  start,
  end,
  label: "",
})

const createText = (
  id: string,
  z: number,
  at: Point,
  style: ShapeStyle
): TextShape => ({
  ...lineStyle(style),
  id,
  z,
  kind: "text",
  x: at.x,
  y: at.y,
  text: "",
  size: "m",
})

const createPen = (
  id: string,
  z: number,
  points: [number, number][],
  style: ShapeStyle
): PenShape => ({ ...lineStyle(style), id, z, kind: "pen", points })

const isLongEnoughArrow = (start: Point, end: Point) =>
  Math.hypot(end.x - start.x, end.y - start.y) >= MIN_DRAG * 1.5

const moveEnd = (end: ArrowEnd, dx: number, dy: number): ArrowEnd =>
  end.shapeId ? end : { shapeId: null, x: end.x + dx, y: end.y + dy }

const moveChanges = (
  shapes: readonly Shape[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number
): ShapeChange[] =>
  shapes.flatMap((shape): ShapeChange[] => {
    if (!ids.has(shape.id)) return []
    switch (shape.kind) {
      case "arrow":
        return [
          {
            type: "update",
            id: shape.id,
            fields: {
              start: moveEnd(shape.start, dx, dy),
              end: moveEnd(shape.end, dx, dy),
            },
          },
        ]
      case "pen":
        return [
          {
            type: "update",
            id: shape.id,
            fields: { points: shape.points.map(([x, y]) => [x + dx, y + dy]) },
          },
        ]
      default:
        return [
          {
            type: "update",
            id: shape.id,
            fields: { x: shape.x + dx, y: shape.y + dy },
          },
        ]
    }
  })

const resizeChange = (
  box: BoxShape,
  corner: Corner,
  to: Point
): ShapeChange => {
  const fixed = {
    x: corner === "nw" || corner === "sw" ? box.x + box.w : box.x,
    y: corner === "nw" || corner === "ne" ? box.y + box.h : box.y,
  }
  const w = Math.max(MIN_BOX_SIZE, Math.abs(to.x - fixed.x))
  const h = Math.max(MIN_BOX_SIZE, Math.abs(to.y - fixed.y))
  return {
    type: "update",
    id: box.id,
    fields: {
      x: to.x < fixed.x ? fixed.x - w : fixed.x,
      y: to.y < fixed.y ? fixed.y - h : fixed.y,
      w,
      h,
    },
  }
}

// Arrows attached to a removed shape stay, detached where they ended.
const removeChanges = (
  shapes: readonly Shape[],
  ids: ReadonlySet<string>
): ShapeChange[] => {
  const boxes = boxesById(shapes)
  return shapes.flatMap((shape): ShapeChange[] => {
    if (ids.has(shape.id)) return [{ type: "remove", id: shape.id }]
    if (shape.kind !== "arrow") return []
    const startGone =
      shape.start.shapeId !== null && ids.has(shape.start.shapeId)
    const endGone = shape.end.shapeId !== null && ids.has(shape.end.shapeId)
    if (!startGone && !endGone) return []
    const segment = arrowSegment(shape, boxes)
    return [
      {
        type: "update",
        id: shape.id,
        fields: {
          start: startGone
            ? { shapeId: null, x: segment.x1, y: segment.y1 }
            : shape.start,
          end: endGone
            ? { shapeId: null, x: segment.x2, y: segment.y2 }
            : shape.end,
        },
      },
    ]
  })
}

const styleFieldsFor = (shape: Shape, style: StyleFields): ShapeFields => {
  if (isBox(shape)) return style
  const { fill: _fill, ...rest } = style
  if (shape.kind !== "text") return rest
  const { width: _width, dashed: _dashed, rough: _rough, ...textStyle } = rest
  return textStyle
}

const restyleChanges = (
  shapes: readonly Shape[],
  ids: ReadonlySet<string>,
  style: StyleFields
): ShapeChange[] =>
  shapes.flatMap((shape): ShapeChange[] => {
    if (!ids.has(shape.id)) return []
    const fields = styleFieldsFor(shape, style)
    return Object.keys(fields).length === 0
      ? []
      : [{ type: "update", id: shape.id, fields }]
  })

const labelChange = (shape: Shape, value: string): ShapeChange | null => {
  if (shape.kind === "text")
    return { type: "update", id: shape.id, fields: { text: value } }
  if (shape.kind === "pen") return null
  return { type: "update", id: shape.id, fields: { label: value } }
}

const reorderChanges = (
  shapes: readonly Shape[],
  ids: ReadonlySet<string>,
  direction: "front" | "back"
): ShapeChange[] => {
  const picked = [...shapes].sort(byZ).filter((shape) => ids.has(shape.id))
  if (picked.length === 0) return []
  const zs = shapes.map((shape) => shape.z)
  const base =
    direction === "front"
      ? Math.max(...zs) + 1
      : Math.min(...zs) - picked.length
  return picked.map((shape, index) => ({
    type: "update",
    id: shape.id,
    fields: { z: base + index },
  }))
}

const duplicateChanges = (
  shapes: readonly Shape[],
  ids: ReadonlySet<string>,
  makeId: () => string
): { changes: ShapeChange[]; ids: string[] } => {
  const picked = [...shapes].sort(byZ).filter((shape) => ids.has(shape.id))
  const copies = new Map(picked.map((shape) => [shape.id, makeId()]))
  const boxes = boxesById(shapes)
  const top = nextZ(shapes)
  // A copied arrow stays attached only to shapes that were copied with it.
  const copyEnd = (end: ArrowEnd, x: number, y: number): ArrowEnd => ({
    shapeId: (end.shapeId && copies.get(end.shapeId)) || null,
    x: x + DUPLICATE_OFFSET,
    y: y + DUPLICATE_OFFSET,
  })
  const changes = picked.flatMap((shape, index): ShapeChange[] => {
    const id = copies.get(shape.id)
    if (!id) return []
    const z = top + index
    if (shape.kind === "arrow") {
      const segment = arrowSegment(shape, boxes)
      return [
        {
          type: "add",
          shape: {
            ...shape,
            id,
            z,
            start: copyEnd(shape.start, segment.x1, segment.y1),
            end: copyEnd(shape.end, segment.x2, segment.y2),
          },
        },
      ]
    }
    const offset = moveChanges(
      [shape],
      new Set([shape.id]),
      DUPLICATE_OFFSET,
      DUPLICATE_OFFSET
    )
    const [moved] = applyToShapes([shape], offset)
    return moved ? [{ type: "add", shape: { ...moved, id, z } }] : []
  })
  return { changes, ids: [...copies.values()] }
}

// Bound arrow ends keep the point where they last met their shape, so an arrow
// whose shape disappears (deleted on another device, or unreadable) stays put
// instead of jumping back to where it was first drawn.
const withBoundEnds = (
  shapes: readonly Shape[],
  changes: readonly ShapeChange[]
): ShapeChange[] => {
  const moved = new Set(
    changes.flatMap((change) => (change.type === "update" ? [change.id] : []))
  )
  const after = applyToShapes(shapes, changes)
  const boxes = boxesById(after)
  const endUpdates = after.flatMap((shape): ShapeChange[] => {
    if (shape.kind !== "arrow") return []
    const { start, end } = shape
    const touched =
      (start.shapeId !== null && moved.has(start.shapeId)) ||
      (end.shapeId !== null && moved.has(end.shapeId))
    if (!touched) return []
    const segment = arrowSegment(shape, boxes)
    return [
      {
        type: "update",
        id: shape.id,
        fields: {
          start: start.shapeId
            ? { shapeId: start.shapeId, x: segment.x1, y: segment.y1 }
            : start,
          end: end.shapeId
            ? { shapeId: end.shapeId, x: segment.x2, y: segment.y2 }
            : end,
        },
      },
    ]
  })
  return [...changes, ...endUpdates]
}

const offsetShapes = (shapes: readonly Shape[], dx: number, dy: number) =>
  applyToShapes(
    shapes,
    withBoundEnds(
      shapes,
      moveChanges(shapes, new Set(shapes.map((shape) => shape.id)), dx, dy)
    )
  )

const mergeFields = (shape: Shape, fields: ShapeFields): Shape => {
  const merged = shapeSchema.safeParse({ ...shape, ...fields })
  return merged.success ? merged.data : shape
}

const applyToShapes = (
  shapes: readonly Shape[],
  changes: readonly ShapeChange[]
): Shape[] => {
  const removed = new Set(
    changes.flatMap((change) => (change.type === "remove" ? [change.id] : []))
  )
  const updates = new Map<string, ShapeFields>()
  for (const change of changes) {
    if (change.type !== "update") continue
    updates.set(change.id, { ...updates.get(change.id), ...change.fields })
  }
  const added = changes.flatMap((change) =>
    change.type === "add" ? [change.shape] : []
  )
  return [...shapes, ...added]
    .filter((shape) => !removed.has(shape.id))
    .map((shape) => {
      const fields = updates.get(shape.id)
      return fields ? mergeFields(shape, fields) : shape
    })
    .sort(byZ)
}

export {
  applyToShapes,
  byZ,
  createArrow,
  createBox,
  createPen,
  createText,
  duplicateChanges,
  isLongEnoughArrow,
  labelChange,
  moveChanges,
  nextZ,
  offsetShapes,
  removeChanges,
  reorderChanges,
  resizeChange,
  restyleChanges,
  withBoundEnds,
}
export type { Corner, ShapeChange, StyleFields }
