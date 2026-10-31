import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Check, ChevronDown, FileText } from "lucide-react"
import { formatActivityTimestamp, now, parseUtc } from "@knight-os/server/core"
import { activityKey, areaDotClassNames } from "@/activities/areas"
import { StatusIcon } from "@/activities/components/StatusIcon"
import { StatusMenu } from "@/activities/components/StatusMenu"
import { statusLabels } from "@/activities/status"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  useMoveActivityToArea,
  useSetActivityStatus,
} from "@/local-db/activity-mutations"
import { activityQuery, areasQuery } from "@/local-db/activity-queries"
import type { ActivityOrigin, ActivityRow } from "@/local-db/db"
import { documentQuery } from "@/local-db/document-queries"
import { cn } from "@/lib/utils"

type Workspace = {
  id: string
  name: string
  slug: string
  timezone: string
}

const propertyButtonClassName =
  "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent"

const chipClassName =
  "relative flex h-8 items-center gap-2 rounded-md bg-muted px-2.5 hover:bg-accent max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1.5"

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

function StatusControl({
  activity,
  workspace,
  className,
}: PropertyControlProps) {
  const setStatus = useSetActivityStatus(workspace.id)
  const label = statusLabels[activity.status]
  return (
    <StatusMenu
      status={activity.status}
      onChange={(status) => setStatus.mutate({ id: activity.id, status })}
      trigger={
        <button
          type="button"
          aria-label={`Status: ${label}`}
          className={className}
        >
          <StatusIcon status={activity.status} />
          {label}
        </button>
      }
    />
  )
}

function AreaControl({ activity, workspace, className }: PropertyControlProps) {
  const { data: areas } = useSuspenseQuery(areasQuery(workspace))
  const moveToArea = useMoveActivityToArea(workspace.id)
  const area = areas.find((candidate) => candidate.id === activity.areaId)
  const label = area?.name ?? "No area"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Area: ${label}`}
            className={className}
          />
        }
      >
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            area ? areaDotClassNames[area.color] : "bg-muted-foreground"
          )}
        />
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Move to area</DropdownMenuLabel>
          {areas.map((option) => (
            <DropdownMenuItem
              key={option.id}
              className="min-h-8 max-md:min-h-11"
              onClick={() => {
                if (option.id !== activity.areaId) {
                  moveToArea.mutate({ id: activity.id, areaId: option.id })
                }
              }}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  areaDotClassNames[option.color]
                )}
              />
              <span className="flex-1">{option.name}</span>
              <span className="text-xs text-muted-foreground">
                {option.key}
              </span>
              {option.id === activity.areaId ? (
                <Check className="text-accent-text" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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

function ActivityProperties({ activity, workspace }: ActivityPropertiesProps) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <Property label="Status">
        <StatusControl
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
      {activity.origin ? (
        <Property label="Written in">
          <OriginLink
            origin={activity.origin}
            workspace={workspace}
            className={propertyButtonClassName}
          />
        </Property>
      ) : null}
      <Property label="Created">
        <CreatedAt
          activity={activity}
          workspace={workspace}
          className="px-2 text-muted-foreground"
        />
      </Property>
    </div>
  )
}

function ActivityPropertyChips({
  activity,
  workspace,
}: ActivityPropertiesProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <StatusControl
        activity={activity}
        workspace={workspace}
        className={chipClassName}
      />
      <AreaControl
        activity={activity}
        workspace={workspace}
        className={chipClassName}
      />
      <CreatedAt
        activity={activity}
        workspace={workspace}
        className="px-1 text-muted-foreground"
      />
    </div>
  )
}

function ActivityOriginLink({ activity, workspace }: ActivityPropertiesProps) {
  if (!activity.origin) return null
  return (
    <OriginLink
      origin={activity.origin}
      workspace={workspace}
      className="mb-1 inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground max-md:min-h-11"
    />
  )
}

export { ActivityOriginLink, ActivityProperties, ActivityPropertyChips }
