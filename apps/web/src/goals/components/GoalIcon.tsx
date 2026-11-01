import { Target } from "lucide-react"
import { cn } from "@/lib/utils"
import { StoredIcon } from "@/notebook/components/StoredIcon"

function GoalIcon({
  icon,
  className,
}: {
  icon: string | null
  className?: string
}) {
  return (
    <StoredIcon
      value={icon}
      className={className}
      fallback={
        <Target
          aria-hidden
          className={cn("size-4 shrink-0 text-accent-text", className)}
        />
      }
    />
  )
}

export { GoalIcon }
