import { cn } from "@/lib/utils"
import { StoredIcon } from "@/notebook/components/StoredIcon"
import type { Routine } from "../use-routine"
import { TypeIcon } from "./TypeIcon"

type TimerType = NonNullable<ReturnType<Routine["typeOf"]>>

function TypeMark({
  type,
  className,
}: {
  type: TimerType | null
  className?: string
}) {
  if (!type) return <span className="size-4 shrink-0" />
  return (
    <span title={type.name} className={cn("flex shrink-0", className)}>
      <StoredIcon
        value={type.icon}
        fallback={<TypeIcon color={type.color} className="m-0.5" />}
      />
    </span>
  )
}

export { TypeMark }
export type { TimerType }
