import { Castle } from "lucide-react"
import { cn } from "@/lib/utils"

export function Brand({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 font-semibold tracking-tight text-foreground",
        className
      )}
    >
      <Castle className="size-[1.2em] shrink-0" />
      Knight OS
    </span>
  )
}
