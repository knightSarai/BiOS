import LZString from "lz-string"
import { z } from "zod"
import { shapeSchema } from "./shapes"
import type {
  ArrowEnd,
  BoxKind,
  DrawingColor,
  Shape,
  StrokeWidth,
  TextSize,
} from "./shapes"

// Obsidian's Excalidraw plugin keeps the scene in a "## Drawing" section, as
// plain JSON or as lz-string base64 split across lines.
const COMPRESSED_BLOCK = /\n##? Drawing\n[^`]*```compressed-json\n([\s\S]*?)```/
const JSON_BLOCK = /\n##? Drawing\n[^`]*```json\n([\s\S]*?)```/

const binding = z.object({ elementId: z.string() }).nullable().optional()

const elementSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().default(0),
  height: z.number().default(0),
  strokeColor: z.string().default("#1e1e1e"),
  backgroundColor: z.string().default("transparent"),
  strokeWidth: z.number().default(2),
  strokeStyle: z.string().default("solid"),
  roughness: z.number().default(1),
  angle: z.number().default(0),
  isDeleted: z.boolean().default(false),
  text: z.string().optional(),
  originalText: z.string().optional(),
  fontSize: z.number().optional(),
  containerId: z.string().nullable().optional(),
  points: z.array(z.tuple([z.number(), z.number()])).optional(),
  startBinding: binding,
  endBinding: binding,
})

const sceneSchema = z.object({ elements: z.array(z.unknown()) })

type ExcalidrawElement = z.infer<typeof elementSchema>

type ImportResult = {
  shapes: Shape[]
  skipped: Record<string, number>
  simplified: Record<string, number>
}

const BOX_KINDS: Record<string, BoxKind> = {
  rectangle: "rect",
  ellipse: "ellipse",
  diamond: "diamond",
}

// Hue anchors for the palette tokens: lilac, rose, blue, amber, teal.
const HUES: [DrawingColor, number][] = [
  ["chart-1", 292],
  ["chart-2", 340],
  ["chart-3", 220],
  ["chart-4", 39],
  ["chart-5", 171],
]

const hexToHsl = (hex: string) => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!match?.[1]) return null
  const digits =
    match[1].length === 3 ? [...match[1]].map((d) => d + d).join("") : match[1]
  const [r, g, b] = [0, 2, 4].map(
    (i) => parseInt(digits.slice(i, i + 2), 16) / 255
  )
  if (r === undefined || g === undefined || b === undefined) return null
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { hue: 0, saturation: 0, lightness }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const hue =
    max === r
      ? 60 * (((g - b) / delta) % 6)
      : max === g
        ? 60 * ((b - r) / delta + 2)
        : 60 * ((r - g) / delta + 4)
  return { hue: (hue + 360) % 360, saturation, lightness }
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

const nearestHue = (hue: number): DrawingColor =>
  HUES.reduce((best, current) =>
    hueDistance(current[1], hue) < hueDistance(best[1], hue) ? current : best
  )[0]

const strokeToken = (color: string): DrawingColor => {
  const hsl = hexToHsl(color)
  if (!hsl) return "foreground"
  if (hsl.saturation < 0.15) {
    return hsl.lightness < 0.35 || hsl.lightness > 0.85 ? "foreground" : "muted"
  }
  return nearestHue(hsl.hue)
}

const fillToken = (color: string): DrawingColor | null => {
  const hsl = hexToHsl(color)
  if (!hsl) return null
  if (hsl.saturation < 0.15) return hsl.lightness > 0.9 ? null : "muted"
  return nearestHue(hsl.hue)
}

const strokeWidthOf = (width: number): StrokeWidth =>
  width <= 1 ? 1 : width <= 2.5 ? 2 : 4

const textSizeOf = (fontSize: number | undefined): TextSize =>
  fontSize === undefined || fontSize <= 16 ? "s" : fontSize <= 24 ? "m" : "l"

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// lz-string throws on some damaged input instead of returning null.
const decompress = (data: string) => {
  try {
    return LZString.decompressFromBase64(data.replace(/\n/g, ""))
  } catch {
    return null
  }
}

const extractScene = (raw: string): unknown => {
  const text = raw.replace(/\r\n?/g, "\n")
  const direct = parseJson(text)
  if (direct !== null) return direct
  const compressed = COMPRESSED_BLOCK.exec(`\n${text}`)?.[1]
  if (compressed) {
    const json = decompress(compressed)
    return json ? parseJson(json) : null
  }
  const plain = JSON_BLOCK.exec(`\n${text}`)?.[1]
  return plain ? parseJson(plain) : null
}

const absolutePoints = (element: ExcalidrawElement): [number, number][] =>
  (element.points ?? [[0, 0]]).map(([x, y]) => [element.x + x, element.y + y])

// Images, frames and embeds have no counterpart here and are counted in
// `skipped`; rotation is dropped and bent arrows are straightened, counted in
// `simplified`, so the importer can say what changed.
const importExcalidraw = (
  text: string,
  makeId: () => string
): ImportResult | null => {
  const scene = sceneSchema.safeParse(extractScene(text))
  if (!scene.success) return null
  const seenIds = new Set<string>()
  const elements = scene.data.elements.flatMap((raw) => {
    const parsed = elementSchema.safeParse(raw)
    if (!parsed.success || parsed.data.isDeleted) return []
    if (seenIds.has(parsed.data.id)) return []
    seenIds.add(parsed.data.id)
    return [parsed.data]
  })
  const ids = new Map(elements.map((element) => [element.id, makeId()]))
  const labels = new Map(
    elements.flatMap((element): [string, string][] =>
      element.type === "text" && element.containerId
        ? [[element.containerId, element.originalText ?? element.text ?? ""]]
        : []
    )
  )
  const boxIds = new Set(
    elements
      .filter((element) => BOX_KINDS[element.type])
      .map((element) => element.id)
  )
  const skipped: Record<string, number> = {}
  const simplified: Record<string, number> = {}
  const count = (tally: Record<string, number>, key: string) => {
    tally[key] = (tally[key] ?? 0) + 1
  }
  const endOf = (
    bound: { elementId: string } | null | undefined,
    point: [number, number]
  ): ArrowEnd => {
    const target =
      bound && boxIds.has(bound.elementId)
        ? ids.get(bound.elementId)
        : undefined
    return { shapeId: target ?? null, x: point[0], y: point[1] }
  }

  const converted = elements.flatMap((element, index): Shape[] => {
    const id = ids.get(element.id)
    if (!id) return []
    const noteRotation = () => {
      if (element.angle !== 0) count(simplified, "rotated shape")
    }
    const style = {
      id,
      z: index + 1,
      stroke: strokeToken(element.strokeColor),
      width: strokeWidthOf(element.strokeWidth),
      dashed: element.strokeStyle !== "solid",
      rough: element.roughness > 0,
    }
    const boxKind = BOX_KINDS[element.type]
    if (boxKind) {
      noteRotation()
      return [
        {
          ...style,
          kind: boxKind,
          x: Math.min(element.x, element.x + element.width),
          y: Math.min(element.y, element.y + element.height),
          w: Math.max(1, Math.abs(element.width)),
          h: Math.max(1, Math.abs(element.height)),
          fill: fillToken(element.backgroundColor),
          label: labels.get(element.id) ?? "",
        },
      ]
    }
    if (element.type === "arrow") {
      const points = absolutePoints(element)
      if (points.length > 2) count(simplified, "bent arrow")
      noteRotation()
      const first = points[0] ?? [element.x, element.y]
      const last = points[points.length - 1] ?? first
      return [
        {
          ...style,
          kind: "arrow",
          start: endOf(element.startBinding, first),
          end: endOf(element.endBinding, last),
          label: labels.get(element.id) ?? "",
        },
      ]
    }
    if (element.type === "line" || element.type === "freedraw") {
      noteRotation()
      return [{ ...style, kind: "pen", points: absolutePoints(element) }]
    }
    if (element.type === "text") {
      if (element.containerId) return []
      noteRotation()
      return [
        {
          ...style,
          kind: "text",
          x: element.x,
          y: element.y,
          text: element.originalText ?? element.text ?? "",
          size: textSizeOf(element.fontSize),
        },
      ]
    }
    count(skipped, element.type)
    return []
  })
  const shapes = converted.flatMap((shape) => {
    const parsed = shapeSchema.safeParse(shape)
    if (parsed.success) return [parsed.data]
    count(skipped, "invalid shape")
    return []
  })
  return { shapes, skipped, simplified }
}

export { importExcalidraw }
export type { ImportResult }
