import { Link } from "@tanstack/react-router"
import { activityKey, areaDotClassNames } from "@/activities/areas"
import { StatusIcon } from "@/activities/components/StatusIcon"
import { StatusMenu } from "@/activities/components/StatusMenu"
import { statusLabels, type ActivityStatus } from "@/activities/status"
import { useSetActivityStatus } from "@/local-db/activity-mutations"
import type { ActivityRow, AreaRow } from "@/local-db/db"
import { cn } from "@/lib/utils"

const GROUP_ORDER: ActivityStatus[] = [
  "progress",
  "todo",
  "backlog",
  "done",
  "canceled",
]

type ActivityListProps = {
  activities: ActivityRow[]
  areas: AreaRow[]
  workspaceId: string
  workspaceSlug: string
}

function ActivityList({
  activities,
  areas,
  workspaceId,
  workspaceSlug,
}: ActivityListProps) {
  const setStatus = useSetActivityStatus(workspaceId)
  const areasById = new Map(areas.map((area) => [area.id, area]))
  const groups = GROUP_ORDER.map((status) => ({
    status,
    items: activities.filter((activity) => activity.status === status),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="overflow-hidden rounded-lg border">
      {groups.map((group) => (
        <section key={group.status} aria-label={statusLabels[group.status]}>
          <h2 className="flex min-h-9 items-center gap-2.5 border-b bg-muted/40 px-4 text-sm font-medium">
            <StatusIcon status={group.status} />
            {statusLabels[group.status]}
            <span className="text-muted-foreground">{group.items.length}</span>
          </h2>
          <ul>
            {group.items.map((activity) => {
              const area = areasById.get(activity.areaId)
              const key = activityKey(area?.key ?? "?", activity.number)
              const closed =
                activity.status === "done" || activity.status === "canceled"
              return (
                <li
                  key={activity.id}
                  className="flex min-h-10 items-center gap-1 border-b px-2 last:border-b-0 hover:bg-accent/60 max-md:min-h-12"
                >
                  <StatusMenu
                    status={activity.status}
                    onChange={(status) =>
                      setStatus.mutate({ id: activity.id, status })
                    }
                    trigger={
                      <button
                        type="button"
                        aria-label={`Change status of ${key}, now ${statusLabels[activity.status]}`}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-muted max-md:size-11"
                      >
                        <StatusIcon status={activity.status} />
                      </button>
                    }
                  />
                  <Link
                    to="/$workspace/activities/$activityId"
                    params={{
                      workspace: workspaceSlug,
                      activityId: activity.id,
                    }}
                    className="flex min-h-10 min-w-0 flex-1 items-center gap-3 pr-2"
                  >
                    <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {key}
                    </span>
                    <span
                      dir="auto"
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        closed && "text-muted-foreground",
                        activity.status === "canceled" && "line-through"
                      )}
                    >
                      {activity.title || "Untitled"}
                    </span>
                    {area ? (
                      <span
                        title={area.name}
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          areaDotClassNames[area.color]
                        )}
                      />
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export { ActivityList }
