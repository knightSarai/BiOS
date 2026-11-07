import { Link } from "@tanstack/react-router"
import { useAtom, useAtomValue } from "jotai"
import { ChevronRight } from "lucide-react"
import { now, toLocalDate } from "@knight-os/server/core"
import { activityKey } from "@/activities/areas"
import { ColorDot } from "@/activities/components/ColorDot"
import { SubActivityProgress } from "@/activities/components/ProgressRing"
import { StatusIcon } from "@/activities/components/StatusIcon"
import { StatusMenu } from "@/activities/components/StatusMenu"
import {
  LIST_DATES,
  dateGroupLabels,
  dateGroupOf,
  dateGroupsFor,
  isListed,
  listDateLabels,
  listDay,
  listDayLabel,
  listOrder,
  type ListDate,
  type ListStatuses,
} from "@/activities/list-view"
import {
  collapsedGroupsAtom,
  listDateAtom,
  listStatusesAtom,
} from "@/activities/list-view-state"
import { statusLabels } from "@/activities/status"
import {
  byCreation,
  descendantsOf,
  groupTree,
  subActivityProgress,
  type TreeNode,
} from "@/activities/sub-activities"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useSetActivityStatus } from "@/local-db/activity-mutations"
import type { ActivityRow, AreaRow } from "@/local-db/db"
import { cn } from "@/lib/utils"

type ActivityListProps = {
  activities: ActivityRow[]
  areas: AreaRow[]
  workspaceId: string
  workspaceSlug: string
  timezone: string
}

const dateOptions = LIST_DATES.map((value) => ({
  value,
  label: listDateLabels[value],
}))

function ActivityListControls({ className }: { className?: string }) {
  const [statuses, setStatuses] = useAtom(listStatusesAtom)
  const [by, setBy] = useAtom(listDateAtom)

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <ToggleGroup
        aria-label="Statuses"
        variant="outline"
        size="sm"
        spacing={0}
        value={[statuses]}
        onValueChange={(next) => {
          const choice = next[0] as ListStatuses | undefined
          if (choice) setStatuses(choice)
        }}
      >
        <ToggleGroupItem value="open" className="max-md:h-11">
          Open
        </ToggleGroupItem>
        <ToggleGroupItem value="all" className="max-md:h-11">
          All statuses
        </ToggleGroupItem>
      </ToggleGroup>
      <Select
        items={dateOptions}
        value={by}
        onValueChange={(next: ListDate | null) => {
          if (next) setBy(next)
        }}
      >
        <SelectTrigger aria-label="Group by date" className="max-md:h-11">
          <span className="text-muted-foreground">Group by</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dateOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ActivityRows({
  nodes,
  activities,
  areasById,
  workspaceId,
  workspaceSlug,
  by,
  timezone,
  nested,
}: {
  nodes: TreeNode<ActivityRow>[]
  activities: ActivityRow[]
  areasById: Map<string, AreaRow>
  workspaceId: string
  workspaceSlug: string
  by: ListDate
  timezone: string
  nested: boolean
}) {
  const setStatus = useSetActivityStatus(workspaceId)

  return (
    <ul className={cn(nested && "ml-[38px] max-md:ml-[46px]")}>
      {nodes.map(({ item: activity, context, children }) => {
        const area = areasById.get(activity.areaId)
        const key = activityKey(area?.key ?? "?", activity.number)
        const closed =
          activity.status === "done" || activity.status === "canceled"
        const progress = subActivityProgress(
          descendantsOf(activities, activity.id).map((row) => row.status)
        )
        const dayLabel = listDayLabel(listDay(activity, by, timezone), by)
        return (
          <li
            key={activity.id}
            className={cn(
              nested &&
                "relative before:absolute before:top-0 before:-left-3 before:h-5 before:w-2.5 before:rounded-bl-md before:border-b before:border-l before:border-border after:absolute after:top-0 after:bottom-0 after:-left-3 after:border-l after:border-border last:after:hidden max-md:before:h-6"
            )}
          >
            <div className="flex min-h-10 items-center gap-1 rounded-md px-3 hover:bg-accent/50 max-md:min-h-12">
              <StatusMenu
                status={activity.status}
                onChange={(status) =>
                  setStatus.mutate({ id: activity.id, status })
                }
                trigger={
                  <button
                    type="button"
                    aria-label={`Change status of ${key}, now ${statusLabels[activity.status]}`}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-muted max-md:size-11",
                      context && "opacity-60"
                    )}
                  >
                    <StatusIcon status={activity.status} />
                  </button>
                }
              />
              <Link
                to="/$workspace/activities/$activityId"
                params={{ workspace: workspaceSlug, activityId: activity.id }}
                className={cn(
                  "flex min-h-10 min-w-0 flex-1 items-center gap-3 pr-1 text-sm",
                  context && "text-muted-foreground"
                )}
              >
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {key}
                </span>
                <span
                  dir="auto"
                  className={cn(
                    "min-w-0 truncate",
                    closed && "text-muted-foreground",
                    activity.status === "canceled" && "line-through"
                  )}
                >
                  {activity.title || "Untitled"}
                  {context ? (
                    <span className="sr-only">
                      {" "}
                      (parent, {statusLabels[activity.status]})
                    </span>
                  ) : null}
                </span>
                {progress.total > 0 ? (
                  <span className="shrink-0 rounded-full border px-2 py-0.5">
                    <SubActivityProgress
                      done={progress.done}
                      total={progress.total}
                    />
                  </span>
                ) : null}
                <span className="flex-1" />
                {area ? (
                  <ColorDot
                    title={area.name}
                    color={area.color}
                    className="size-2 shrink-0"
                  />
                ) : null}
                {dayLabel ? (
                  <span className="w-32 shrink-0 text-right text-xs text-muted-foreground tabular-nums max-sm:hidden">
                    {dayLabel}
                  </span>
                ) : null}
              </Link>
            </div>
            {children.length > 0 ? (
              <ActivityRows
                nodes={children}
                activities={activities}
                areasById={areasById}
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
                by={by}
                timezone={timezone}
                nested
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

// Grouped by a date, as in Linear. Sub-activities sit under their parent; a parent
// in another group, or hidden by the status filter, comes along dimmed.
function ActivityList({
  activities,
  areas,
  workspaceId,
  workspaceSlug,
  timezone,
}: ActivityListProps) {
  const [statuses, setStatuses] = useAtom(listStatusesAtom)
  const by = useAtomValue(listDateAtom)
  const [collapsed, setCollapsed] = useAtom(collapsedGroupsAtom)
  const areasById = new Map(areas.map((area) => [area.id, area]))
  const today = toLocalDate(now(), timezone)
  const ordered = activities.toSorted(listOrder(by))
  const groupOf = (activity: ActivityRow) =>
    dateGroupOf(listDay(activity, by, timezone), by, today)

  const groups = dateGroupsFor(by)
    .map((group) => {
      const isMember = (activity: ActivityRow) =>
        isListed(activity, statuses) && groupOf(activity) === group
      return {
        group,
        count: activities.filter(isMember).length,
        tree: groupTree(ordered, isMember, byCreation),
      }
    })
    .filter((group) => group.count > 0)

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
        <p>{statuses === "open" ? "No open activities." : "No activities."}</p>
        {statuses === "open" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStatuses("all")}
          >
            Show all statuses
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {groups.map(({ group, count, tree }) => {
        const open = !collapsed.includes(group)
        return (
          <section key={group} aria-label={dateGroupLabels[group]}>
            <h2>
              <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                  setCollapsed(
                    open
                      ? [...collapsed, group]
                      : collapsed.filter((other) => other !== group)
                  )
                }
                className="flex min-h-9 w-full items-center gap-2 rounded-md bg-muted/60 px-3 text-left text-sm font-medium hover:bg-muted max-md:min-h-11"
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform",
                    open && "rotate-90"
                  )}
                />
                {dateGroupLabels[group]}
                <span className="font-normal text-muted-foreground">
                  {count}
                </span>
              </button>
            </h2>
            {open ? (
              <div className="py-1">
                <ActivityRows
                  nodes={tree}
                  activities={activities}
                  areasById={areasById}
                  workspaceId={workspaceId}
                  workspaceSlug={workspaceSlug}
                  by={by}
                  timezone={timezone}
                  nested={false}
                />
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

export { ActivityList, ActivityListControls }
