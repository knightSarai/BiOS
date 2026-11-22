import { Suspense } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useAtom, useSetAtom } from "jotai"
import { Ellipsis, Pause, Play, Plus } from "lucide-react"
import {
  NewActivityForm,
  type NewActivityWorkspace,
} from "@/activities/components/NewActivityForm"
import { SubActivityProgress } from "@/activities/components/ProgressRing"
import { swatchStyle } from "@/activities/components/ColorDot"
import { TimerField } from "@/activities/components/RoutineTimer"
import { StatusIcon } from "@/activities/components/StatusIcon"
import { subActivityFormAtom } from "@/activities/new-activity"
import { findNode, type RoutineNode, type Session } from "@/activities/routine"
import {
  actualVersusPlanned,
  clock,
  isLive,
  playOnlyHint,
  timeNote,
} from "@/activities/routine-view"
import {
  descendantIndex,
  subActivityProgress,
  subActivityTree,
  type TreeNode,
} from "@/activities/sub-activities"
import {
  useRoutine,
  useRoutineSession,
  type Routine,
} from "@/activities/use-routine"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import type { ActivitiesRepository } from "@/local-db/activities"
import { useToggleActivityDone } from "@/local-db/activity-mutations"
import {
  activitySummaryQuery,
  routineQuery,
  subActivitiesQuery,
} from "@/local-db/activity-queries"
import type { ActivityRow } from "@/local-db/db"
import { cn } from "@/lib/utils"

type Workspace = { id: string; slug: string }

type SubActivity = Awaited<
  ReturnType<ActivitiesRepository["subActivities"]>
>[number]

type FormParent = {
  id: string
  key: string
  // The type the next one starts with: the last one added.
  typeId: string | null
}

// What actually happened against the plan, or the plan itself before any time is logged,
// typed over in place while the activity is still open.
function TimeColumn({
  timer,
  node,
  open,
}: {
  timer: Routine
  node: RoutineNode
  open: boolean
}) {
  const result = actualVersusPlanned(timer.session, node)
  const note = timeNote(result)
  if (result.actual === 0) {
    return open && node.children.length === 0 ? (
      <TimerField workspaceId={timer.workspaceId} node={node} variant="row" />
    ) : (
      <>{result.planned ? clock(result.planned) : "counts up"}</>
    )
  }
  return (
    <>
      <span className="text-foreground">{clock(result.actual)}</span>
      {result.planned ? (
        <span className="opacity-70"> of {clock(result.planned)}</span>
      ) : null}
      {note ? (
        <span
          className="text-muted-foreground"
          title={
            note === "ended early"
              ? undefined
              : "Typed in afterwards, not timed"
          }
        >
          {" "}
          · {note}
        </span>
      ) : null}
    </>
  )
}

// A row's actions sit behind one ⋯ so titles keep their room, on phones especially.
function RowMenu({
  label,
  only,
  onAdd,
}: {
  label: string
  only: { hint: string; onClick: () => void } | null
  onAdd: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100 max-md:size-11 max-md:opacity-100"
            aria-label={`More for ${label}`}
            title="More"
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {only ? (
          <DropdownMenuItem onClick={only.onClick}>
            <Play />
            Play only this
            <span className="ml-auto text-xs text-muted-foreground">
              {only.hint}
            </span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onAdd}>
          <Plus />
          Add sub-activity
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// A countdown stops counting once its activity has sub-activities, so the form says so first.
const noticeFor = (node: RoutineNode | null) =>
  node && node.children.length === 0 && node.timer.mode === "down"
    ? `${node.title} counts down from ${clock(node.timer.seconds)}. With sub-activities, ${node.title}’s time is the sum of theirs.`
    : null

function SubActivityRows({
  nodes,
  descendantsOf,
  workspace,
  nested,
  timer,
  form,
}: {
  nodes: TreeNode<SubActivity>[]
  descendantsOf: (id: string) => SubActivity[]
  workspace: Workspace
  nested: boolean
  timer: Routine | null
  form: (parent: FormParent) => React.ReactNode
}) {
  const toggleDone = useToggleActivityDone(workspace.id)
  const setFormFor = useSetAtom(subActivityFormAtom)
  const session = timer?.session ?? null

  return (
    <ul className={cn("flex flex-col", nested && "ml-7")}>
      {nodes.map(({ item: child, children }) => {
        const closed = child.status === "done" || child.status === "canceled"
        const below = descendantsOf(child.id)
        const progress = subActivityProgress(below.map((row) => row.status))
        const node = session ? findNode(session.root, child.id) : null
        const live =
          session !== null &&
          isLive(session) &&
          session.current?.node.id === child.id
        const running = live && session.phase === "running"
        const playingThis =
          session?.phase === "running" && session.scope?.id === child.id
        const type = timer?.typeOf(node) ?? null
        const childForm = form({
          id: child.id,
          key: child.key,
          typeId: children.at(-1)?.item.typeId ?? child.typeId,
        })
        return (
          <li
            key={child.id}
            className={cn(
              nested &&
                "relative before:absolute before:top-0 before:-left-3 before:h-[18px] before:w-2.5 before:rounded-bl-md before:border-b before:border-l before:border-border after:absolute after:top-0 after:bottom-0 after:-left-3 after:border-l after:border-border last:after:hidden max-md:before:h-[22px]"
            )}
          >
            <div
              style={live && type ? swatchStyle(type.color) : undefined}
              className={cn(
                "group/row flex min-h-9 items-center gap-3 rounded-md px-2 hover:bg-accent max-md:min-h-11",
                live && "bg-selection hover:bg-selection",
                live &&
                  type &&
                  "bg-[color-mix(in_oklch,var(--swatch)_14%,var(--color-background))] hover:bg-[color-mix(in_oklch,var(--swatch)_14%,var(--color-background))]"
              )}
            >
              <Checkbox
                checked={child.status === "done"}
                className="max-md:after:-inset-3.5"
                aria-label={
                  child.status === "done"
                    ? `Reopen ${child.key}`
                    : `Mark ${child.key} as done`
                }
                // Ticking the one that's running still hands over to the next, and its waiting
                // time is settled like any other Done.
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
                    closed && !live && "text-muted-foreground",
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
              {live ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.625rem] font-semibold tracking-wider text-background uppercase",
                    running
                      ? type
                        ? "bg-(--swatch)"
                        : "bg-accent-text"
                      : "bg-foreground"
                  )}
                >
                  {running ? "Now" : "Paused"}
                </span>
              ) : timer && node ? (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  <TimeColumn timer={timer} node={node} open={!closed} />
                </span>
              ) : null}
              {playingThis && timer ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Pause"
                  title="Pause"
                  onClick={() => timer.act({ kind: "pause" })}
                  className="rounded-full text-accent-text max-md:size-11"
                >
                  <Pause />
                </Button>
              ) : live ? null : (
                <RowMenu
                  label={child.title || child.key}
                  only={
                    timer
                      ? {
                          hint: playOnlyHint(timer.session),
                          onClick: () =>
                            timer.act({ kind: "playOnly", id: child.id }),
                        }
                      : null
                  }
                  onAdd={() => setFormFor(child.id)}
                />
              )}
            </div>
            {children.length > 0 ? (
              <SubActivityRows
                nodes={children}
                descendantsOf={descendantsOf}
                workspace={workspace}
                nested
                timer={timer}
                form={form}
              />
            ) : null}
            {childForm ? <div className="ml-7">{childForm}</div> : null}
          </li>
        )
      })}
    </ul>
  )
}

function SubActivityList({
  activity,
  activityKey,
  workspace,
  className,
  timer,
}: {
  activity: ActivityRow
  activityKey: string
  workspace: NewActivityWorkspace
  className?: string
  timer: Routine | null
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
  const form = (parent: FormParent) =>
    formFor === parent.id ? (
      <div className="my-1 rounded-lg border bg-card text-sm shadow-sm">
        <Suspense fallback={<Skeleton className="m-4 h-24" />}>
          <NewActivityForm
            key={parent.id}
            workspace={workspace}
            variant="inline"
            notice={noticeFor(
              timer ? findNode(timer.session.root, parent.id) : null
            )}
            request={{
              areaId: activity.areaId,
              goalId: activity.goalId,
              typeId: parent.typeId,
              parent: { id: parent.id, key: parent.key },
            }}
            onClose={closeForm}
          />
        </Suspense>
      </div>
    ) : null

  // One outer shape for both states, so the form keeps focus when the first one is added
  // and the live region is already there to announce it.
  return (
    <section
      aria-label="Sub-activities"
      className={cn("flex flex-col gap-1", className)}
    >
      <p aria-live="polite" className="sr-only">
        {all.length === 0
          ? ""
          : `${progress.done} of ${progress.total} sub-activities done`}
      </p>
      {all.length === 0 ? (
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
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="flex items-center gap-3">
              <h2 className="text-sm text-muted-foreground">Sub-activities</h2>
              <SubActivityProgress
                done={progress.done}
                total={progress.total}
              />
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
            descendantsOf={descendantIndex(all)}
            workspace={workspace}
            nested={false}
            timer={timer}
            form={form}
          />
        </>
      )}
      {form({
        id: activity.id,
        key: activityKey,
        typeId: tree.at(-1)?.item.typeId ?? null,
      })}
    </section>
  )
}

function TimedSubActivities({
  global,
  ...props
}: Omit<Parameters<typeof SubActivityList>[0], "timer"> & {
  global: Session
}) {
  const timer = useRoutine(props.workspace.id, global, props.activity.id)
  return <SubActivityList {...props} timer={timer} />
}

function SubActivities(
  props: Omit<Parameters<typeof SubActivityList>[0], "timer">
) {
  const { data: state } = useQuery(
    routineQuery(props.workspace.id, props.activity.id)
  )
  const global = useRoutineSession(state)
  return global ? (
    <TimedSubActivities {...props} global={global} />
  ) : (
    <SubActivityList {...props} timer={null} />
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
