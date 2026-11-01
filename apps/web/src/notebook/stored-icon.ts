const ICON_COLOR_NAMES = [
  "neutral",
  "slate",
  "indigo",
  "cyan",
  "green",
  "yellow",
  "orange",
  "pink",
  "red",
] as const

type IconColor = (typeof ICON_COLOR_NAMES)[number]

const ICON_COLORS: Record<
  IconColor,
  { label: string; text: string; swatch: string }
> = {
  neutral: {
    label: "Neutral",
    text: "text-foreground/75",
    swatch: "bg-foreground/60",
  },
  slate: {
    label: "Slate",
    text: "text-slate-500 dark:text-slate-400",
    swatch: "bg-slate-400",
  },
  indigo: {
    label: "Indigo",
    text: "text-indigo-500 dark:text-indigo-400",
    swatch: "bg-indigo-500",
  },
  cyan: {
    label: "Cyan",
    text: "text-cyan-600 dark:text-cyan-400",
    swatch: "bg-cyan-500",
  },
  green: {
    label: "Green",
    text: "text-emerald-600 dark:text-emerald-400",
    swatch: "bg-emerald-500",
  },
  yellow: {
    label: "Yellow",
    text: "text-amber-500 dark:text-yellow-400",
    swatch: "bg-yellow-400",
  },
  orange: {
    label: "Orange",
    text: "text-orange-500 dark:text-orange-400",
    swatch: "bg-orange-400",
  },
  pink: {
    label: "Pink",
    text: "text-pink-400 dark:text-pink-300",
    swatch: "bg-pink-300",
  },
  red: {
    label: "Red",
    text: "text-red-500 dark:text-red-400",
    swatch: "bg-red-500",
  },
}

const DEFAULT_ICON_COLOR: IconColor = "neutral"

const ICON_PREFIX = "phosphor:"

// Every document stores this so the picker can show it as the current choice.
const DEFAULT_DOCUMENT_ICON = "lucide:file"

type StoredIcon =
  | { kind: "file" }
  | { kind: "emoji"; emoji: string }
  | { kind: "icon"; name: string; color: IconColor }

const isIconColor = (value: string): value is IconColor =>
  ICON_COLOR_NAMES.some((name) => name === value)

// Icons share the emoji column, so anything without the prefix is an emoji.
const parseStoredIcon = (value: string): StoredIcon => {
  if (value === DEFAULT_DOCUMENT_ICON) return { kind: "file" }
  if (!value.startsWith(ICON_PREFIX)) return { kind: "emoji", emoji: value }
  const [name = "", color = ""] = value.slice(ICON_PREFIX.length).split(":")
  return {
    kind: "icon",
    name,
    color: isIconColor(color) ? color : DEFAULT_ICON_COLOR,
  }
}

const iconValue = (name: string, color: IconColor) =>
  `${ICON_PREFIX}${name}:${color}`

const hasCustomIcon = (value: string | null) =>
  value !== null && value !== DEFAULT_DOCUMENT_ICON

export {
  DEFAULT_DOCUMENT_ICON,
  DEFAULT_ICON_COLOR,
  hasCustomIcon,
  ICON_COLOR_NAMES,
  ICON_COLORS,
  iconValue,
  isIconColor,
  parseStoredIcon,
}
export type { IconColor, StoredIcon }
