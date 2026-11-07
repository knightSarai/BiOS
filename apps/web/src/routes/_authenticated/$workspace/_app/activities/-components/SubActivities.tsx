import { Suspense } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useAtom } from "jotai"
import { Plus } from "lucide-react"
import {
  NewActivityForm,
  type NewActivityWorkspace,
} from "@/activities/components/NewActivityForm"
import { SubActivityProgress } from "@/activities/components/ProgressRing"
import { StatusIcon } from "@/activities/components/StatusIcon"
import { subActivityFormAtom } from "@/activities/new-activity"
import {
  descendantsOf,
  subActivityProgress,
  subActivityTree,
  type TreeNode,
} from "@/activities/sub-activities"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import type { ActivitiesRepository } from "@/local-db/activities"
import { useToggleActivityDone } from "@/local-db/activity-mutations"
import {
  activitySummaryQuery,
  subActivitiesQuery,
} from "@/local-db/activity-queries"
import type { ActivityRow } from "@/local-db/db"
import { cn } from "@/lib/utils"

type Workspace = { id: string; slug: string }

type SubActivity = Awaited<
  ReturnType<ActivitiesRepository["subActivities"]>
>[number]

function SubActivityRows({
  nodes,
  all,
  workspace,
  nested,
}: {
  nodes: TreeNode<SubActivity>[]
  all: SubActivity[]
  workspace: Workspace
  nested: boolean
}) {
  const toggleDone = useToggleActivityDone(workspace.id)

  return (
    <ul className={cn("flex flex-col", nested && "ml-7")}>
      {nodes.map(({ item: child, children }) => {
        const closed = child.status === "done" || child.status === "canceled"
        const below = descendantsOf(all, child.id)
        const progress = subActivityProgress(below.map((row) => row.status))
        return (
          <li
            key={child.id}
            className={cn(
              nested &&
                "relative before:absolute before:top-0 before:-left-3 before:h-[18px] before:w-2.5 before:rounded-bl-md before:border-b before:border-l before:border-border after:absolute after:top-0 after:bottom-0 after:-left-3 after:border-l after:border-border last:after:hidden max-md:before:h-[22px]"
            )}
          >
            <div className="flex min-h-9 items-center gap-3 rounded-md px-2 hover:bg-accent max-md:min-h-11">
              <Checkbox
                checked={child.status === "done"}
                aria-label={
                  child.status === "done"
                    ? `Reopen ${child.key}`
                    : `Mark ${child.key} as done`
                }
                onCheckedChange={() => toggleDone.mutate(child.id)}
              />
              <Link
                to="/$workspace/activities/$activityId"
                params={{ workspace: workspace.slug, activityId: child.id }}
                className="flex min-w-0 flex-1 items-center gap-2 text-sm"
              >
                <StatusIcon status={child.status} />
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {child.key}
                </span>
                <span
                  dir="auto"
                  className={cn(
                    "min-w-0 truncate",
                    closed && "text-muted-foreground",
                    child.status === "canceled" && "line-through"
                  )}
                >
                  {child.title || "Untitled"}
                </span>
                {below.length > 0 ? (
                  <span className="shrink-0 rounded-full border px-2 py-0.5">
                    <SubActivityProgress
                      done={progress.done}
                      total={progress.total}
                    />
                  </span>
                ) : null}
                {child.details ? (
                  <span className="ml-auto max-w-[45%] min-w-0 truncate text-xs text-muted-foreground tabular-nums">
                    {child.details}
                  </span>
                ) : null}
              </Link>
            </div>
            {children.length > 0 ? (
              <SubActivityRows
                nodes={children}
                all={all}
                workspace={workspace}
                nested
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function SubActivities({
  activity,
  activityKey,
  workspace,
  className,
}: {
  activity: ActivityRow
  activityKey: string
  workspace: NewActivityWorkspace
  className?: string
}) {
  const { data: all = [] } = useQuery(
    subActivitiesQuery(workspace.id, activity.id)
  )
  const [formFor, setFormFor] = useAtom(subActivityFormAtom)
  const formOpen = formFor === activity.id
  const tree = subActivityTree(all, activity.id)
  const progress = subActivityProgress(all.map((child) => child.status))
  const openForm = () => setFormFor(activity.id)
  const closeForm = () => setFormFor(null)

  // A new sub-activity starts with the parent's area and goal, and the type of the last one added.
  const lastChild = tree.at(-1)?.item
  const form = formOpen ? (
    <div className="rounded-lg border bg-card text-sm shadow-sm">
      <Suspense fallback={<Skeleton className="m-4 h-24" />}>
        <NewActivityForm
          key={activity.id}
          workspace={workspace}
          variant="inline"
          request={{
            areaId: activity.areaId,
            goalId: activity.goalId,
            typeId: lastChild?.typeId ?? null,
            parent: { id: activity.id, key: activityKey },
          }}
          onClose={closeForm}
        />
      </Suspense>
    </div>
  ) : null

  if (all.length === 0) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground max-md:h-11"
          aria-expanded={formOpen}
          onClick={openForm}
        >
          <Plus data-icon="inline-start" />
          Add sub-activities
        </Button>
        {form}
      </div>
    )
  }

  return (
    <section
      aria-label="Sub-activities"
      className={cn("flex flex-col gap-1", className)}
    >
      <div className="flex items-center justify-between gap-2 px-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm text-muted-foreground">Sub-activities</h2>
          <SubActivityProgress done={progress.done} total={progress.total} />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="max-md:size-11"
          aria-label="Add sub-activity"
          title="Add sub-activity"
          aria-expanded={formOpen}
          onClick={openForm}
        >
          <Plus />
        </Button>
      </div>
      <SubActivityRows
        nodes={tree}
        all={all}
        workspace={workspace}
        nested={false}
      />
      {form}
    </section>
  )
}

function ParentHeader({
  parentId,
  workspace,
}: {
  parentId: string
  workspace: Workspace
}) {
  const { data: parent } = useQuery(
    activitySummaryQuery(workspace.id, parentId)
  )
  const { data: family = [] } = useQuery(
    subActivitiesQuery(workspace.id, parentId)
  )
  if (!parent) return null
  const progress = subActivityProgress(family.map((child) => child.status))

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>Sub-activity of</span>
      <Link
        to="/$workspace/activities/$activityId"
        params={{ workspace: workspace.slug, activityId: parent.id }}
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1 hover:bg-accent hover:text-foreground max-md:min-h-11"
      >
        <StatusIcon status={parent.status} />
        <span className="shrink-0 text-xs tabular-nums">{parent.key}</span>
        <span dir="auto" className="truncate text-foreground">
          {parent.title || "Untitled"}
        </span>
      </Link>
      <span className="rounded-full border px-2 py-0.5">
        <SubActivityProgress done={progress.done} total={progress.total} />
      </span>
    </div>
  )
}

export { ParentHeader, SubActivities }
