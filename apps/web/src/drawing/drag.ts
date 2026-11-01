import {
  boxAt,
  createArrow,
  createBox,
  createPen,
  isBox,
  isLongEnoughArrow,
  moveChanges,
  nextZ,
  resizeChange,
  withBoundEnds,
} from "@knight-os/drawing"
import type {
  BoxKind,
  Camera,
  Corner,
  Point,
  Shape,
  ShapeChange,
  ShapeStyle,
} from "@knight-os/drawing"

type Drag =
  | { mode: "move"; ids: ReadonlySet<string>; start: Point; current: Point }
  | { mode: "resize"; id: string; corner: Corner; current: Point }
  | {
      mode: "create"
      kind: BoxKind
      id: string
      style: ShapeStyle
      start: Point
      current: Point
    }
  | {
      mode: "arrow"
      id: string
      style: ShapeStyle
      fromId: string | null
      start: Point
      current: Point
    }
  | {
      mode: "pen"
      id: string
      style: ShapeStyle
      points: [number, number][]
    }
  | { mode: "marquee"; start: Point; current: Point }
  | { mode: "pan"; startScreen: Point; startCamera: Camera }
  | {
      mode: "pinch"
      startDistance: number
      startCenter: Point
      startCamera: Camera
    }

// What the drawing looks like mid-gesture; the same changes are written to
// the document only when the pointer lifts, so a drag is one undo step and
// one sync update instead of one per pointer move.
const dragChanges = (
  drag: Drag | null,
  shapes: readonly Shape[]
): ShapeChange[] => {
  if (!drag) return []
  switch (drag.mode) {
    case "move":
      return moveChanges(
        shapes,
        drag.ids,
        drag.current.x - drag.start.x,
        drag.current.y - drag.start.y
      )
    case "resize": {
      const box = shapes.find((shape) => shape.id === drag.id)
      return box && isBox(box)
        ? [resizeChange(box, drag.corner, drag.current)]
        : []
    }
    case "create":
      return [
        {
          type: "add",
          shape: createBox(
            drag.kind,
            drag.id,
            nextZ(shapes),
            drag.start,
            drag.current,
            drag.style
          ),
        },
      ]
    case "arrow": {
      const target = boxAt(shapes, drag.current, drag.fromId)
      return [
        {
          type: "add",
          shape: createArrow(
            drag.id,
            nextZ(shapes),
            { shapeId: drag.fromId, x: drag.start.x, y: drag.start.y },
            {
              shapeId: target?.id ?? null,
              x: drag.current.x,
              y: drag.current.y,
            },
            drag.style
          ),
        },
      ]
    }
    case "pen":
      return [
        {
          type: "add",
          shape: createPen(drag.id, nextZ(shapes), drag.points, drag.style),
        },
      ]
    default:
      return []
  }
}

const shouldCommit = (drag: Drag, shapes: readonly Shape[]) => {
  switch (drag.mode) {
    case "move":
      return drag.current.x !== drag.start.x || drag.current.y !== drag.start.y
    case "arrow":
      return (
        isLongEnoughArrow(drag.start, drag.current) ||
        boxAt(shapes, drag.current, drag.fromId) !== null
      )
    case "resize":
    case "create":
    case "pen":
      return true
    default:
      return false
  }
}

const committedChanges = (drag: Drag | null, shapes: readonly Shape[]) => {
  if (!drag || !shouldCommit(drag, shapes)) return []
  const changes = dragChanges(drag, shapes)
  return drag.mode === "move" || drag.mode === "resize"
    ? withBoundEnds(shapes, changes)
    : changes
}

export { committedChanges, dragChanges }
export type { Drag }
