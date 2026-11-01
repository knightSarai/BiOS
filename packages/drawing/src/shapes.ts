import { z } from "zod"

const DRAWING_COLORS = [
  "foreground",
  "muted",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const

const BOX_KINDS = ["rect", "ellipse", "diamond"] as const

const STROKE_WIDTHS = [1, 2, 4] as const

const TEXT_SIZES = { s: 14, m: 18, l: 28 } as const

const drawingColor = z.enum(DRAWING_COLORS)

const shapeBase = {
  id: z.string().min(1),
  z: z.number(),
  stroke: drawingColor,
  width: z.literal(STROKE_WIDTHS),
  dashed: z.boolean(),
  rough: z.boolean().default(false),
}

const boxShape = z.object({
  ...shapeBase,
  kind: z.enum(BOX_KINDS),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  fill: drawingColor.nullable(),
  label: z.string(),
})

const arrowEnd = z.object({
  shapeId: z.string().nullable(),
  x: z.number(),
  y: z.number(),
})

const arrowShape = z.object({
  ...shapeBase,
  kind: z.literal("arrow"),
  start: arrowEnd,
  end: arrowEnd,
  label: z.string(),
})

const textShape = z.object({
  ...shapeBase,
  kind: z.literal("text"),
  x: z.number(),
  y: z.number(),
  text: z.string(),
  size: z.enum(["s", "m", "l"]),
})

const penShape = z.object({
  ...shapeBase,
  kind: z.literal("pen"),
  points: z.array(z.tuple([z.number(), z.number()])).min(1),
})

const shapeSchema = z.discriminatedUnion("kind", [
  boxShape,
  arrowShape,
  textShape,
  penShape,
])

type Shape = z.infer<typeof shapeSchema>
type BoxShape = z.infer<typeof boxShape>
type ArrowShape = z.infer<typeof arrowShape>
type ArrowEnd = z.infer<typeof arrowEnd>
type TextShape = z.infer<typeof textShape>
type PenShape = z.infer<typeof penShape>
type BoxKind = BoxShape["kind"]
type DrawingColor = z.infer<typeof drawingColor>
type StrokeWidth = Shape["width"]
type TextSize = TextShape["size"]

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

type ShapeFields = Partial<DistributiveOmit<Shape, "id" | "kind">>

type ShapeStyle = Pick<
  BoxShape,
  "stroke" | "fill" | "width" | "dashed" | "rough"
>

const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  stroke: "foreground",
  fill: null,
  width: 2,
  dashed: false,
  rough: false,
}

const isBox = (shape: Shape): shape is BoxShape =>
  shape.kind === "rect" || shape.kind === "ellipse" || shape.kind === "diamond"

export {
  BOX_KINDS,
  DEFAULT_SHAPE_STYLE,
  DRAWING_COLORS,
  STROKE_WIDTHS,
  TEXT_SIZES,
  isBox,
  shapeSchema,
}
export type {
  ArrowEnd,
  ArrowShape,
  BoxKind,
  BoxShape,
  DrawingColor,
  PenShape,
  Shape,
  ShapeFields,
  ShapeStyle,
  StrokeWidth,
  TextShape,
  TextSize,
}
