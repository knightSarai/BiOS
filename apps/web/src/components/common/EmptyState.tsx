import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type EmptyStateSlotProps = {
  children?: ReactNode
}

type EmptyStateRootProps = EmptyStateSlotProps & {
  variant?: "default" | "panel"
}

function Root({ children, variant = "default" }: EmptyStateRootProps) {
  return (
    <div
      data-variant={variant}
      className={cn(
        "group/empty-state flex flex-col items-center",
        variant === "panel"
          ? "flex-1 justify-center gap-3 p-8 text-center"
          : "gap-4 rounded-sm border border-dashed py-16"
      )}
    >
      {children}
    </div>
  )
}

function Icon({ icon: IconComponent }: { icon: LucideIcon }) {
  return <IconComponent className="size-10 text-muted-foreground" />
}

function Text({ children }: EmptyStateSlotProps) {
  return <div className="text-center">{children}</div>
}

function Title({ children }: EmptyStateSlotProps) {
  return (
    <p className="font-medium group-data-[variant=panel]/empty-state:text-sm">
      {children}
    </p>
  )
}

function Description({ children }: EmptyStateSlotProps) {
  return (
    <p className="text-sm text-muted-foreground group-data-[variant=panel]/empty-state:text-xs">
      {children}
    </p>
  )
}

export const EmptyState = {
  Root,
  Icon,
  Text,
  Title,
  Description,
}
