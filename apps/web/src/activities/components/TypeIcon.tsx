import { Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { ICON_PATHS } from "@/notebook/icon-paths.generated"
import { parseStoredIcon } from "@/notebook/stored-icon"
import { IconGlyph } from "@/notebook/components/StoredIcon"
import type { TypeColor } from "../activity-types"
import { swatchStyle } from "./ColorDot"

function TypeIcon({
  color,
  icon,
  className,
}: {
  color: TypeColor | null
  icon: string | null
  className?: string
}) {
  const stored = icon ? parseStoredIcon(icon) : null
  if (stored?.kind === "emoji") {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center text-[13px] leading-none",
          className
        )}
      >
        {stored.emoji}
      </span>
    )
  }
  const paths = stored?.kind === "icon" ? ICON_PATHS.get(stored.name) : null
  const tint = color ? "text-(--swatch)" : "text-muted-foreground"
  if (paths) {
    return (
      <span
        style={color ? swatchStyle(color) : undefined}
        className={cn("flex shrink-0", tint)}
      >
        <IconGlyph paths={paths} className={cn("size-3.5", className)} />
      </span>
    )
  }
  return (
    <Tag
      aria-hidden
      style={color ? swatchStyle(color) : undefined}
      className={cn("size-3.5 shrink-0", tint, className)}
    />
  )
}

export { TypeIcon }
