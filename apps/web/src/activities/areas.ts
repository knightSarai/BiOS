import { z } from "zod"

const AREA_COLORS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const

type PresetColor = (typeof AREA_COLORS)[number]

type HexColor = `#${string}`

type AreaColor = PresetColor | HexColor

const HEX_COLOR = /^#[0-9a-f]{6}$/

const isHexColor = (color: string): color is HexColor => HEX_COLOR.test(color)

const colorSchema = z.union([
  z.enum(AREA_COLORS),
  z.custom<HexColor>(
    (color) => typeof color === "string" && isHexColor(color),
    "Use a hex colour, like #4f86b8."
  ),
])

// Mid tones that keep their contrast on both the light and the dark card.
const EXTRA_COLORS = [
  { value: "#e07a5f", name: "Coral" },
  { value: "#e9a178", name: "Peach" },
  { value: "#c9a96e", name: "Sand" },
  { value: "#a3a05a", name: "Olive" },
  { value: "#8fae7c", name: "Sage" },
  { value: "#6f9e6e", name: "Moss" },
  { value: "#6aaed6", name: "Sky" },
  { value: "#4f86b8", name: "Ocean" },
  { value: "#7b7fd1", name: "Indigo" },
  { value: "#a68fd8", name: "Lavender" },
  { value: "#b9638a", name: "Berry" },
  { value: "#8a94a6", name: "Slate" },
] as const satisfies readonly { value: HexColor; name: string }[]

const presetColorNames: Record<PresetColor, string> = {
  "chart-1": "Plum",
  "chart-2": "Rose",
  "chart-3": "Blue",
  "chart-4": "Amber",
  "chart-5": "Teal",
}

// Accepts "fff", "#fff" or "#FFFFFF" and returns the lowercase six-digit form the store keeps.
const toSixDigitHex = (text: string) => {
  const digits = text.trim().toLowerCase().replace(/^#/, "")
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits}`
}

const colorName = (color: AreaColor) =>
  isHexColor(color)
    ? (EXTRA_COLORS.find((extra) => extra.value === color)?.name ??
      `Custom colour ${color}`)
    : presetColorNames[color]

const cssColor = (color: AreaColor) =>
  isHexColor(color) ? color : `var(--${color})`

const AREA_KEY_PATTERN = /^[A-Z]{2,5}$/

const areaKeyFromName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase()

const activityKey = (areaKey: string, number: number) => `${areaKey}-${number}`

export {
  AREA_COLORS,
  AREA_KEY_PATTERN,
  EXTRA_COLORS,
  activityKey,
  areaKeyFromName,
  colorName,
  colorSchema,
  cssColor,
  isHexColor,
  toSixDigitHex,
}
export type { AreaColor, HexColor, PresetColor }
