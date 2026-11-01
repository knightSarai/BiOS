import { arrowSegment, boxesById, textBoxSize } from "./geometry"
import { TEXT_SIZES, isBox } from "./shapes"
import type { BoxShape, DrawingColor, Shape } from "./shapes"

// Colours stay tokens until here, so each platform maps them to its own light
// or dark values (CSS variables on the web, hex on native).
type Palette = {
  color: (token: DrawingColor) => string
  fill: (token: DrawingColor) => string
  canvas: string
  ink: string
  muted: string
}

type Primitive =
  | {
      type: "path"
      key: string
      d: string
      fill: string | null
      stroke: string | null
      strokeWidth: number
      dash: string | null
    }
  | {
      type: "text"
      key: string
      x: number
      y: number
      lines: string[]
      size: number
      lineHeight: number
      color: string
      anchor: "start" | "middle"
      weight: 400 | 500
    }

const LABEL_SIZE = 14
const ARROW_LABEL_SIZE = 12
const LINE_HEIGHT = 1.3
const CORNER_RADIUS = 8

const n = (value: number) => Math.round(value * 100) / 100

const roundRectPath = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(CORNER_RADIUS, w / 2, h / 2)
  const x1 = x + w
  const y1 = y + h
  return [
    `M${n(x + r)} ${n(y)}`,
    `H${n(x1 - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x1)} ${n(y + r)}`,
    `V${n(y1 - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x1 - r)} ${n(y1)}`,
    `H${n(x + r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y1 - r)}`,
    `V${n(y + r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}`,
    "Z",
  ].join(" ")
}

const boxPath = (shape: BoxShape) => {
  const { x, y, w, h } = shape
  if (shape.kind === "rect") return roundRectPath(x, y, w, h)
  const cx = x + w / 2
  const cy = y + h / 2
  if (shape.kind === "ellipse") {
    const rx = n(w / 2)
    const ry = n(h / 2)
    return `M${n(x)} ${n(cy)} A${rx} ${ry} 0 1 0 ${n(x + w)} ${n(cy)} A${rx} ${ry} 0 1 0 ${n(x)} ${n(cy)} Z`
  }
  return `M${n(cx)} ${n(y)} L${n(x + w)} ${n(cy)} L${n(cx)} ${n(y + h)} L${n(x)} ${n(cy)} Z`
}

const penPath = (points: readonly [number, number][]) => {
  const [first, ...rest] = points
  if (!first) return ""
  if (rest.length === 0) return `M${n(first[0])} ${n(first[1])} l0.01 0`
  const parts = [`M${n(first[0])} ${n(first[1])}`]
  rest.forEach((point, index) => {
    const next = rest[index + 1]
    if (!next) {
      parts.push(`L${n(point[0])} ${n(point[1])}`)
      return
    }
    const mx = (point[0] + next[0]) / 2
    const my = (point[1] + next[1]) / 2
    parts.push(`Q${n(point[0])} ${n(point[1])} ${n(mx)} ${n(my)}`)
  })
  return parts.join(" ")
}

const ROUGH_JITTER = 2.4
const ROUGH_PASSES = 2
const ELLIPSE_STEPS = 32

// A hand-drawn rectangle has square corners, so its fill follows the outline
// instead of the rounded clean path.
const polygonPath = (vertices: Vertex[]) =>
  vertices
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${n(x)} ${n(y)}`)
    .join(" ") + " Z"

// Deterministic per shape, so a hand-drawn shape keeps the same wobble on
// every render and every device.
const seededRandom = (seed: string) => {
  let state = 7
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

type Vertex = [number, number]

const outlineOf = (shape: BoxShape): Vertex[] => {
  const { x, y, w, h } = shape
  const cx = x + w / 2
  const cy = y + h / 2
  if (shape.kind === "diamond") {
    return [
      [cx, y],
      [x + w, cy],
      [cx, y + h],
      [x, cy],
    ]
  }
  if (shape.kind === "ellipse") {
    return Array.from({ length: ELLIPSE_STEPS }, (_, index): Vertex => {
      const angle = (index / ELLIPSE_STEPS) * Math.PI * 2
      return [cx + (Math.cos(angle) * w) / 2, cy + (Math.sin(angle) * h) / 2]
    })
  }
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
}

const roughPath = (seed: string, vertices: Vertex[], closed: boolean) => {
  const random = seededRandom(seed)
  const jitter = () => (random() - 0.5) * ROUGH_JITTER
  const segments = closed ? vertices.length : vertices.length - 1
  const parts: string[] = []
  for (let pass = 0; pass < ROUGH_PASSES; pass++) {
    for (let index = 0; index < segments; index++) {
      const from = vertices[index]
      const to = vertices[(index + 1) % vertices.length]
      if (!from || !to) continue
      const mx = (from[0] + to[0]) / 2 + jitter() * 1.6
      const my = (from[1] + to[1]) / 2 + jitter() * 1.6
      parts.push(
        `M${n(from[0] + jitter())} ${n(from[1] + jitter())} Q${n(mx)} ${n(my)} ${n(to[0] + jitter())} ${n(to[1] + jitter())}`
      )
    }
  }
  return parts.join(" ")
}

const dashFor = (dashed: boolean, width: number) =>
  dashed ? `${width * 3} ${width * 3}` : null

const textLines = (text: string) => text.split("\n")

const renderShape = (
  shape: Shape,
  boxes: ReadonlyMap<string, BoxShape>,
  palette: Palette
): Primitive[] => {
  const stroke = palette.color(shape.stroke)
  if (isBox(shape)) {
    const d = boxPath(shape)
    const dash = dashFor(shape.dashed, shape.width)
    const fill = shape.fill ? palette.fill(shape.fill) : null
    const primitives: Primitive[] = shape.rough
      ? [
          ...(fill
            ? [
                {
                  type: "path" as const,
                  key: `${shape.id}:fill`,
                  d:
                    shape.kind === "ellipse"
                      ? d
                      : polygonPath(outlineOf(shape)),
                  fill,
                  stroke: null,
                  strokeWidth: 0,
                  dash: null,
                },
              ]
            : []),
          {
            type: "path",
            key: shape.id,
            d: roughPath(shape.id, outlineOf(shape), true),
            fill: null,
            stroke,
            strokeWidth: shape.width,
            dash,
          },
        ]
      : [
          {
            type: "path",
            key: shape.id,
            d,
            fill,
            stroke,
            strokeWidth: shape.width,
            dash,
          },
        ]
    if (shape.label) {
      const lines = textLines(shape.label)
      primitives.push({
        type: "text",
        key: `${shape.id}:label`,
        x: shape.x + shape.w / 2,
        y:
          shape.y +
          shape.h / 2 -
          ((lines.length - 1) * LABEL_SIZE * LINE_HEIGHT) / 2,
        lines,
        size: LABEL_SIZE,
        lineHeight: LABEL_SIZE * LINE_HEIGHT,
        color: palette.ink,
        anchor: "middle",
        weight: 500,
      })
    }
    return primitives
  }
  switch (shape.kind) {
    case "arrow": {
      const s = arrowSegment(shape, boxes)
      const dx = s.x2 - s.x1
      const dy = s.y2 - s.y1
      const length = Math.hypot(dx, dy) || 1
      const ux = dx / length
      const uy = dy / length
      const headLength = 10 + shape.width * 2
      const headWidth = 5 + shape.width
      const bx = s.x2 - ux * headLength * 0.85
      const by = s.y2 - uy * headLength * 0.85
      const primitives: Primitive[] = [
        {
          type: "path",
          key: shape.id,
          d: shape.rough
            ? roughPath(
                shape.id,
                [
                  [s.x1, s.y1],
                  [bx, by],
                ],
                false
              )
            : `M${n(s.x1)} ${n(s.y1)} L${n(bx)} ${n(by)}`,
          fill: null,
          stroke,
          strokeWidth: shape.width,
          dash: dashFor(shape.dashed, shape.width),
        },
        {
          type: "path",
          key: `${shape.id}:head`,
          d: `M${n(s.x2)} ${n(s.y2)} L${n(s.x2 - ux * headLength - uy * headWidth)} ${n(s.y2 - uy * headLength + ux * headWidth)} L${n(s.x2 - ux * headLength + uy * headWidth)} ${n(s.y2 - uy * headLength - ux * headWidth)} Z`,
          fill: stroke,
          stroke,
          strokeWidth: 1,
          dash: null,
        },
      ]
      if (shape.label) {
        const mx = (s.x1 + s.x2) / 2
        const my = (s.y1 + s.y2) / 2
        const size = textBoxSize(shape.label, ARROW_LABEL_SIZE)
        primitives.push(
          {
            type: "path",
            key: `${shape.id}:label-bg`,
            d: roundRectPath(
              mx - size.w / 2 - 6,
              my - size.h / 2,
              size.w + 12,
              size.h
            ),
            fill: palette.canvas,
            stroke: null,
            strokeWidth: 0,
            dash: null,
          },
          {
            type: "text",
            key: `${shape.id}:label`,
            x: mx,
            y: my - ((size.lines - 1) * ARROW_LABEL_SIZE * LINE_HEIGHT) / 2,
            lines: textLines(shape.label),
            size: ARROW_LABEL_SIZE,
            lineHeight: ARROW_LABEL_SIZE * LINE_HEIGHT,
            color: palette.muted,
            anchor: "middle",
            weight: 400,
          }
        )
      }
      return primitives
    }
    case "pen":
      return [
        {
          type: "path",
          key: shape.id,
          d: penPath(shape.points),
          fill: null,
          stroke,
          strokeWidth: shape.width,
          dash: null,
        },
      ]
    case "text": {
      const size = TEXT_SIZES[shape.size]
      return [
        {
          type: "text",
          key: shape.id,
          x: shape.x,
          y: shape.y + (size * LINE_HEIGHT) / 2,
          lines: textLines(shape.text),
          size,
          lineHeight: size * LINE_HEIGHT,
          color: stroke,
          anchor: "start",
          weight: 400,
        },
      ]
    }
  }
}

const renderShapes = (shapes: readonly Shape[], palette: Palette) => {
  const boxes = boxesById(shapes)
  return shapes.flatMap((shape) => renderShape(shape, boxes, palette))
}

export { renderShapes }
export type { Palette, Primitive }
