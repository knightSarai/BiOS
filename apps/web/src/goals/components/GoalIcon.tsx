import { Target } from "lucide-react"
import { cn } from "@/lib/utils"

function GoalIcon({
  icon,
  className,
}: {
  icon: string | null
  className?: string
}) {
  if (icon) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center text-[13px] leading-none",
          className
        )}
      >
        {icon}
      </span>
    )
  }
  return (
    <Target
      aria-hidden
      className={cn("size-4 shrink-0 text-accent-text", className)}
    />
  )
}

export { GoalIcon }
