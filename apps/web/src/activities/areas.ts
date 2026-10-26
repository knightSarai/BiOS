const AREA_COLORS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const

type AreaColor = (typeof AREA_COLORS)[number]

const areaDotClassNames: Record<AreaColor, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
}

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
  activityKey,
  areaDotClassNames,
  areaKeyFromName,
}
export type { AreaColor }
