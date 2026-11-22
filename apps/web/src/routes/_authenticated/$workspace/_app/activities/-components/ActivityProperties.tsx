import { useRef } from "react"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useSetAtom } from "jotai"
import {
  CalendarDays,
  ChevronDown,
  CornerLeftUp,
  FileText,
  Target,
} from "lucide-react"
import {
  formatActivityTimestamp,
  formatDayLabel,
  now,
  parseUtc,
} from "@knight-os/server/core"
import { activityKey } from "@/activities/areas"
import { AreaMenu } from "@/activities/components/AreaMenu"
import { ColorDot } from "@/activities/components/ColorDot"
import { DueDateMenu } from "@/activities/components/DueDateMenu"
import { GoalMenu } from "@/activities/components/GoalMenu"
import { AddTime, useAddTimeOffer } from "@/activities/components/LogTime"
import {
  StatusValue,
  TimerValue,
  type PageStatus,
} from "@/activities/components/RoutineTimer"
import { StatusIcon } from "@/activities/components/StatusIcon"
import { findNode, type Session } from "@/activities/routine"
import { useRoutine, useRoutineSession } from "@/activities/use-routine"
import { GoalIcon } from "@/goals/components/GoalIcon"
import {
  useMoveActivityToArea,
  useSetActivityDueDate,
  useSetActivityGoal,
} from "@/local-db/activity-mutations"
import { goalListQuery } from "@/local-db/goal-queries"
import {
  activityQuery,
  activitySummaryQuery,
  areasQuery,
  routineQuery,
} from "@/local-db/activity-queries"
import type { ActivityOrigin, ActivityRow } from "@/local-db/db"
import { documentQuery } from "@/local-db/document-queries"
import { cn } from "@/lib/utils"
import { TypeControl, useActivityType } from "./ActivityTypeFields"
import { openParentDialogAtom } from "./ParentDialog"

type Workspace = {
  id: string
  name: string
  slug: string
  timezone: string
}

const propertyButtonClassName =
  "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent"

const inlinePropertyButtonClassName =
  "flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-accent"

const createdClassName = "flex min-h-8 items-center px-2 text-muted-foreground"

function Property({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-2">
      <span className="px-2 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function OriginLink({
  origin,
  workspace,
  className,
}: {
  origin: ActivityOrigin
  workspace: Workspace
  className: string
}) {
  const document = useQuery({
    ...documentQuery(
      workspace.id,
      origin.kind === "document" ? origin.documentId : ""
    ),
    enabled: origin.kind === "document",
  })
  const parent = useQuery({
    ...activityQuery(
      workspace.id,
      origin.kind === "activity" ? origin.activityId : ""
    ),
    enabled: origin.kind === "activity",
  })
  const hash = origin.blockId ? `block-${origin.blockId}` : undefined

  if (origin.kind === "document") {
    return (
      <Link
        to="/$workspace/documents/$documentId"
        params={{ workspace: workspace.slug, documentId: origin.documentId }}
        hash={hash}
        className={className}
      >
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {document.data ? document.data.title || "Untitled" : "Document"}
        </span>
      </Link>
    )
  }

  const parentRow = parent.data
  if (parentRow === null) {
    return (
      <span className={cn(className, "text-muted-foreground")}>
        Deleted activity
      </span>
    )
  }
  return (
    <Link
      to="/$workspace/activities/$activityId"
      params={{ workspace: workspace.slug, activityId: origin.activityId }}
      hash={hash}
      className={className}
    >
      {parentRow ? (
        <>
          <StatusIcon status={parentRow.activity.status} />
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {activityKey(parentRow.area?.key ?? "?", parentRow.activity.number)}
          </span>
          <span className="truncate">
            {parentRow.activity.title || "Untitled"}
          </span>
        </>
      ) : (
        <span className="truncate">Activity</span>
      )}
    </Link>
  )
}

type ActivityPropertiesProps = {
  activity: ActivityRow
  workspace: Workspace
}

type PropertyControlProps = ActivityPropertiesProps & { className: string }

function AreaControl({ activity, workspace, className }: PropertyControlProps) {
  const { data: areas } = useSuspenseQuery(areasQuery(workspace))
  const moveToArea = useMoveActivityToArea(workspace.id)
  const area = areas.find((candidate) => candidate.id === activity.areaId)
  const label = area?.name ?? "No area"

  return (
    <AreaMenu
      areas={areas}
      value={activity.areaId}
      heading="Move to area"
      onChange={(areaId) => moveToArea.mutate({ id: activity.id, areaId })}
      trigger={
        <button
          type="button"
          aria-label={`Area: ${label}`}
          className={className}
        >
          <ColorDot color={area?.color ?? null} className="size-2 shrink-0" />
          <span className="flex-1 truncate">{label}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      }
    />
  )
}

function GoalControl({ activity, workspace, className }: PropertyControlProps) {
  const { data: goals } = useQuery(goalListQuery(workspace.id))
  const setGoal = useSetActivityGoal(workspace.id)
  const goal = goals?.find((candidate) => candidate.id === activity.goalId)
  const label = goal ? goal.title || "Untitled goal" : "No goal"

  return (
    <GoalMenu
      goals={goals ?? []}
      value={activity.goalId}
      onChange={(goalId) => setGoal.mutate({ id: activity.id, goalId })}
      trigger={
        <button
          type="button"
          aria-label={`Goal: ${label}`}
          className={className}
        >
          {goal ? (
            <GoalIcon icon={goal.icon} className="size-3.5" />
          ) : (
            <Target className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn("flex-1 truncate", !goal && "text-muted-foreground")}
          >
            {label}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      }
    />
  )
}

function DueDateControl({
  activity,
  workspace,
  className,
}: PropertyControlProps) {
  const setDueDate = useSetActivityDueDate(workspace.id)
  const label = activity.dueDate ? formatDayLabel(activity.dueDate) : "No date"

  return (
    <DueDateMenu
      value={activity.dueDate}
      timezone={workspace.timezone}
      onChange={(dueDate) => setDueDate.mutate({ id: activity.id, dueDate })}
      trigger={
        <button
          type="button"
          aria-label={`Due date: ${label}`}
          className={className}
        >
          <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
          <span
            className={cn(
              "flex-1 truncate",
              !activity.dueDate && "text-muted-foreground"
            )}
          >
            {label}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      }
    />
  )
}

function ParentControl({
  activity,
  activityKey,
  workspace,
  className,
}: PropertyControlProps & { activityKey: string }) {
  const openParentDialog = useSetAtom(openParentDialogAtom)
  const { data: parent } = useQuery({
    ...activitySummaryQuery(workspace.id, activity.parentId ?? ""),
    enabled: activity.parentId !== null,
  })
  const label = parent ? `${parent.key} ${parent.title}` : "No parent"

  return (
    <button
      type="button"
      aria-label={`Parent: ${label}`}
      className={className}
      onClick={() =>
        openParentDialog({
          activityId: activity.id,
          activityKey,
          hasParent: activity.parentId !== null,
        })
      }
    >
      {parent ? (
        <StatusIcon status={parent.status} />
      ) : (
        <CornerLeftUp className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span
        className={cn("flex-1 truncate", !parent && "text-muted-foreground")}
      >
        {parent ? (
          <>
            <span className="text-xs text-muted-foreground tabular-nums">
              {parent.key}
            </span>{" "}
            {parent.title || "Untitled"}
          </>
        ) : (
          "No parent"
        )}
      </span>
    </button>
  )
}

// The parent header already says where a sub-activity written in its parent came from.
const showsOrigin = (activity: ActivityRow) =>
  activity.origin !== null &&
  !(
    activity.origin.kind === "activity" &&
    activity.origin.activityId === activity.parentId
  )

function CreatedAt({ activity, workspace, className }: PropertyControlProps) {
  return (
    <span className={className}>
      {formatActivityTimestamp(
        activity.createdAt,
        workspace.timezone,
        parseUtc(now())
      )}
    </span>
  )
}

function useActivityKey(activity: ActivityRow, workspace: Workspace) {
  const { data: areas } = useSuspenseQuery(areasQuery(workspace))
  const area = areas.find((candidate) => candidate.id === activity.areaId)
  return activityKey(area?.key ?? "?", activity.number)
}

// Status, then the timer that finishes it, as two of the activity's properties. Keyed by
// activity where it's used, since the page itself stays mounted from one activity to the next.
function StatusAndTimer({
  activity,
  workspace,
  addTime,
  buttonClassName,
}: ActivityPropertiesProps & {
  addTime: "popover" | "sheet"
  buttonClassName: string
}) {
  const { data: state } = useQuery(routineQuery(workspace.id, activity.id))
  const global = useRoutineSession(state)
  const { type } = useActivityType(activity, workspace.id)
  const status = { value: activity.status, names: type?.statusNames ?? null }
  const offer = useAddTimeOffer(global?.root.id ?? activity.id)
  const statusRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Property label="Status">
        <StatusValue
          workspaceId={workspace.id}
          activityId={activity.id}
          status={status}
          offer={offer}
          buttonRef={statusRef}
          className={buttonClassName}
        />
      </Property>
      {global ? (
        <TimerProperty
          activity={activity}
          workspace={workspace}
          global={global}
          status={status}
          offer={offer}
          statusRef={statusRef}
          addTime={addTime}
        />
      ) : null}
    </>
  )
}

function TimerProperty({
  activity,
  workspace,
  global,
  status,
  offer,
  statusRef,
  addTime,
}: ActivityPropertiesProps & {
  global: Session
  status: PageStatus
  offer: ReturnType<typeof useAddTimeOffer>
  statusRef: React.RefObject<HTMLButtonElement | null>
  addTime: "popover" | "sheet"
}) {
  const timer = useRoutine(workspace.id, global, activity.id)
  const addRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Property label="Timer">
        <TimerValue
          timer={timer}
          status={status}
          offer={offer}
          addRef={addRef}
          surface={addTime === "popover" ? "panel" : "phone"}
          className="pl-1"
        />
      </Property>
      <AddTime
        timer={timer}
        node={findNode(timer.routine, activity.id) ?? timer.routine}
        offer={offer}
        anchors={{ status: statusRef, timer: addRef }}
        timezone={workspace.timezone}
        variant={addTime}
      />
    </>
  )
}

function ActivityProperties({ activity, workspace }: ActivityPropertiesProps) {
  const key = useActivityKey(activity, workspace)
  return (
    <div className="flex flex-col gap-1 text-sm">
      <StatusAndTimer
        key={activity.id}
        activity={activity}
        workspace={workspace}
        addTime="popover"
        buttonClassName={propertyButtonClassName}
      />
      <Property label="Created">
        <CreatedAt
          activity={activity}
          workspace={workspace}
          className={createdClassName}
        />
      </Property>
      <Property label="Type">
        <TypeControl
          activity={activity}
          workspace={workspace}
          className={propertyButtonClassName}
        />
      </Property>
      <Property label="Area">
        <AreaControl
          activity={activity}
          workspace={workspace}
          className={propertyButtonClassName}
        />
      </Property>
      <Property label="Goal">
        <GoalControl
          activity={activity}
          workspace={workspace}
          className={propertyButtonClassName}
        />
      </Property>
      <Property label="Parent">
        <ParentControl
          activity={activity}
          activityKey={key}
          workspace={workspace}
          className={propertyButtonClassName}
        />
      </Property>
      <Property label="Due">
        <DueDateControl
          activity={activity}
          workspace={workspace}
          className={propertyButtonClassName}
        />
      </Property>
      {activity.origin && showsOrigin(activity) ? (
        <Property label="Written in">
          <OriginLink
            origin={activity.origin}
            workspace={workspace}
            className={propertyButtonClassName}
          />
        </Property>
      ) : null}
    </div>
  )
}

// No "Written in" row: below lg, ActivityOriginLink shows it above the title.
function ActivityPropertyRows({
  activity,
  workspace,
}: ActivityPropertiesProps) {
  const key = useActivityKey(activity, workspace)
  return (
    <div className="-mx-2 mb-6 flex flex-col text-sm *:min-h-11">
      <StatusAndTimer
        key={activity.id}
        activity={activity}
        workspace={workspace}
        addTime="sheet"
        buttonClassName={inlinePropertyButtonClassName}
      />
      <Property label="Created">
        <CreatedAt
          activity={activity}
          workspace={workspace}
          className={createdClassName}
        />
      </Property>
      <Property label="Type">
        <TypeControl
          activity={activity}
          workspace={workspace}
          className={inlinePropertyButtonClassName}
        />
      </Property>
      <Property label="Area">
        <AreaControl
          activity={activity}
          workspace={workspace}
          className={inlinePropertyButtonClassName}
        />
      </Property>
      <Property label="Goal">
        <GoalControl
          activity={activity}
          workspace={workspace}
          className={inlinePropertyButtonClassName}
        />
      </Property>
      <Property label="Parent">
        <ParentControl
          activity={activity}
          activityKey={key}
          workspace={workspace}
          className={inlinePropertyButtonClassName}
        />
      </Property>
      <Property label="Due">
        <DueDateControl
          activity={activity}
          workspace={workspace}
          className={inlinePropertyButtonClassName}
        />
      </Property>
    </div>
  )
}

function ActivityOriginLink({ activity, workspace }: ActivityPropertiesProps) {
  if (!activity.origin || !showsOrigin(activity)) return null
  return (
    <OriginLink
      origin={activity.origin}
      workspace={workspace}
      className="mb-1 inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground max-md:min-h-11"
    />
  )
}

export { ActivityOriginLink, ActivityProperties, ActivityPropertyRows }
