import { Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TypeColor } from "../activity-types"
import { swatchStyle } from "./ColorDot"

function TypeIcon({
  color,
  className,
}: {
  color: TypeColor | null
  className?: string
}) {
  return (
    <Tag
      aria-hidden
      style={color ? swatchStyle(color) : undefined}
      className={cn(
        "size-3.5 shrink-0",
        color ? "text-(--swatch)" : "text-muted-foreground",
        className
      )}
    />
  )
}

export { TypeIcon }
