import { Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TypeColor } from "../activity-types"
import { areaTextClassNames } from "../areas"

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
      className={cn(
        "size-3.5 shrink-0",
        color ? areaTextClassNames[color] : "text-muted-foreground",
        className
      )}
    />
  )
}

export { TypeIcon }
