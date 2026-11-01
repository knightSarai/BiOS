import { areaDotClassNames } from "@/activities/areas"
import { StatusIcon } from "@/activities/components/StatusIcon"
import { GoalIcon } from "@/goals/components/GoalIcon"
import { cn } from "@/lib/utils"
import type { OwnerSummary } from "../use-cases"

const ownerTitle = (owner: OwnerSummary) =>
  owner.title || (owner.kind === "goal" ? "Untitled goal" : "Untitled")

const ownerSubtitle = (owner: OwnerSummary) => {
  if (owner.kind === "activity") return `Activity in ${owner.areaName}`
  if (owner.kind === "area") return "Area"
  return "Goal"
}

function OwnerIcon({ owner }: { owner: OwnerSummary }) {
  if (owner.kind === "activity") return <StatusIcon status={owner.status} />
  if (owner.kind === "area") {
    return (
      <span
        aria-hidden
        className={cn(
          "mx-1 size-2 shrink-0 rounded-full",
          areaDotClassNames[owner.color]
        )}
      />
    )
  }
  return <GoalIcon icon={owner.icon} className="size-3.5" />
}

export { OwnerIcon, ownerSubtitle, ownerTitle }
