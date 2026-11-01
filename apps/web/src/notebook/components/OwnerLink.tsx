import { Link } from "@tanstack/react-router"
import { parseOwnerKey, type OwnerKey } from "../owners"

type OwnerLinkProps = {
  ownerKey: OwnerKey
  workspaceSlug: string
  className?: string
  children: React.ReactNode
  "aria-label"?: string
  onClick?: () => void
}

function OwnerLink({
  ownerKey,
  workspaceSlug,
  className,
  children,
  "aria-label": ariaLabel,
  onClick,
}: OwnerLinkProps) {
  const owner = parseOwnerKey(ownerKey)
  if (!owner) return null
  if (owner.kind === "area") {
    return (
      <Link
        to="/$workspace/activities"
        params={{ workspace: workspaceSlug }}
        search={{ area: owner.id }}
        className={className}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {children}
      </Link>
    )
  }
  if (owner.kind === "activity") {
    return (
      <Link
        to="/$workspace/activities/$activityId"
        params={{ workspace: workspaceSlug, activityId: owner.id }}
        className={className}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {children}
      </Link>
    )
  }
  return (
    <Link
      to="/$workspace/goals/$goalId"
      params={{ workspace: workspaceSlug, goalId: owner.id }}
      className={className}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}

export { OwnerLink }
