import { ChevronDown } from "lucide-react"
import { areaDotClassNames, type AreaColor } from "@/activities/areas"
import type { ActivityStatus } from "@/activities/status"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  GOAL_STATUSES,
  goalStatusLabels,
  type GoalStatus,
} from "@/goals/status"
import {
  useSetGoalStatus,
  useSetGoalTargetMonth,
} from "@/local-db/goal-mutations"
import type { GoalRow } from "@/local-db/db"
import { cn } from "@/lib/utils"
import { TargetMonthPicker } from "./TargetMonthPicker"

type GoalGroup = {
  area: { id: string; name: string; color: AreaColor }
  activities: { status: ActivityStatus }[]
}

type GoalPropertiesProps = {
  goal: GoalRow
  groups: GoalGroup[]
  workspaceId: string
  timezone: string
}

const labelClassName = "text-xs text-muted-foreground"

function GoalProperties({
  goal,
  groups,
  workspaceId,
  timezone,
}: GoalPropertiesProps) {
  const setStatus = useSetGoalStatus(workspaceId, goal.id)
  const setTarget = useSetGoalTargetMonth(workspaceId, goal.id)
  const all = groups.flatMap((group) => group.activities)
  const done = all.filter((activity) => activity.status === "done").length

  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <div className="flex items-center gap-2">
        <dt className={labelClassName}>Status</dt>
        <dd>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex min-h-7 items-center gap-1 rounded-md px-1.5 hover:bg-accent aria-expanded:bg-accent max-md:min-h-11"
                />
              }
            >
              <span className={cn(goal.status === "dropped" && "line-through")}>
                {goalStatusLabels[goal.status]}
              </span>
              <ChevronDown className="size-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuRadioGroup
                value={goal.status}
                onValueChange={(value) => setStatus.mutate(value as GoalStatus)}
              >
                {GOAL_STATUSES.map((status) => (
                  <DropdownMenuRadioItem
                    key={status}
                    value={status}
                    className="min-h-8 max-md:min-h-11"
                  >
                    {goalStatusLabels[status]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </dd>
      </div>
      <div className="flex items-center gap-2">
        <dt className={labelClassName}>Target</dt>
        <dd>
          <TargetMonthPicker
            value={goal.targetMonth}
            timezone={timezone}
            onChange={setTarget.mutate}
          />
        </dd>
      </div>
      {groups.length > 0 ? (
        <div className="flex items-center gap-2">
          <dt className={labelClassName}>Areas</dt>
          <dd className="flex flex-wrap gap-1">
            {groups.map((group) => (
              <span
                key={group.area.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs"
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    areaDotClassNames[group.area.color]
                  )}
                />
                {group.area.name}
              </span>
            ))}
          </dd>
        </div>
      ) : null}
      {all.length > 0 ? (
        <div className="flex items-center gap-2">
          <dt className="sr-only">Progress</dt>
          <dd className="text-xs text-muted-foreground">
            <span className="text-foreground">
              {done} of {all.length}
            </span>{" "}
            done
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

export { GoalProperties }
