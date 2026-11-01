import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { ICON_PATHS } from "../icon-paths.generated"
import { ICON_COLORS, parseStoredIcon } from "../stored-icon"

function IconGlyph({
  paths,
  className,
}: {
  paths: readonly string[]
  className?: string
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 256 256"
      fill="currentColor"
      className={cn("size-4 shrink-0", className)}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

function StoredIcon({
  value,
  fallback,
  className,
}: {
  value: string | null
  fallback: ReactNode
  className?: string
}) {
  if (!value) return fallback
  const stored = parseStoredIcon(value)
  if (stored.kind === "file") return fallback
  if (stored.kind === "emoji") {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center text-[13px] leading-none",
          className
        )}
      >
        {stored.emoji}
      </span>
    )
  }
  const paths = ICON_PATHS.get(stored.name)
  if (!paths) return fallback
  return (
    <IconGlyph
      paths={paths}
      className={cn(ICON_COLORS[stored.color].text, className)}
    />
  )
}

export { IconGlyph, StoredIcon }
