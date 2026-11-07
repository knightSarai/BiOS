import { ColorDot } from "@/activities/components/ColorDot"
import { StatusIcon } from "@/activities/components/StatusIcon"
import { GoalIcon } from "@/goals/components/GoalIcon"
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
      <ColorDot
        aria-hidden
        color={owner.color}
        className="mx-1 size-2 shrink-0"
      />
    )
  }
  return <GoalIcon icon={owner.icon} className="size-3.5" />
}

export { OwnerIcon, ownerSubtitle, ownerTitle }
