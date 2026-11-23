import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { FieldInput } from "@/activities/components/FieldInput"
import { TypeIcon } from "@/activities/components/TypeIcon"
import { TypeMenu } from "@/activities/components/TypeMenu"
import {
  useChangeActivityType,
  useSetActivityField,
} from "@/local-db/activity-mutations"
import {
  activityFieldLibraryQuery,
  activityTypesQuery,
} from "@/local-db/activity-queries"
import type { ActivityFieldRow, ActivityRow } from "@/local-db/db"
import { cn } from "@/lib/utils"

type Workspace = { id: string; timezone: string }

const useActivityType = (activity: ActivityRow, workspaceId: string) => {
  const { data: types } = useQuery(activityTypesQuery(workspaceId))
  return {
    types: types ?? [],
    type: types?.find((candidate) => candidate.id === activity.typeId) ?? null,
  }
}

// Values stay with the activity, so changing type needs no warning.
function TypeControl({
  activity,
  workspace,
  className,
}: {
  activity: ActivityRow
  workspace: Workspace
  className: string
}) {
  const { types, type } = useActivityType(activity, workspace.id)
  const changeType = useChangeActivityType(workspace.id)
  const label = type?.name ?? "No type"

  return (
    <TypeMenu
      types={types}
      value={activity.typeId}
      workspaceId={workspace.id}
      onChange={(typeId) =>
        changeType.mutate(
          { id: activity.id, typeId },
          { onError: () => toast.error("Couldn't change the type.") }
        )
      }
      trigger={
        <button
          type="button"
          aria-label={`Type: ${label}`}
          className={className}
        >
          <TypeIcon color={type?.color ?? null} icon={type?.icon ?? null} />
          <span
            className={cn("flex-1 truncate", !type && "text-muted-foreground")}
          >
            {label}
          </span>
        </button>
      }
    />
  )
}

function ActivityFields({
  activity,
  workspace,
  className,
}: {
  activity: ActivityRow
  workspace: Workspace
  className?: string
}) {
  const { type } = useActivityType(activity, workspace.id)
  const { data: library = [] } = useQuery(
    activityFieldLibraryQuery(workspace.id)
  )
  const setField = useSetActivityField(workspace.id)
  const typeFields = type?.fields ?? []
  const onType = new Set(typeFields.map((field) => field.id))
  const otherFields = library.filter(
    (field) => !onType.has(field.id) && field.id in activity.fields
  )
  if (typeFields.length === 0 && otherFields.length === 0) return null

  const input = (field: ActivityFieldRow) => (
    <FieldInput
      key={field.id}
      field={field}
      value={activity.fields[field.id]}
      timezone={workspace.timezone}
      layout="stacked"
      commitOnBlur
      onChange={(value) =>
        setField.mutate(
          { id: activity.id, fieldId: field.id, value },
          {
            onError: (error) =>
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Couldn't save the field."
              ),
          }
        )
      }
    />
  )

  return (
    <section
      aria-label={type ? `${type.name} fields` : "Fields"}
      className={cn("flex flex-col gap-3", className)}
    >
      {typeFields.map(input)}
      {typeFields.length > 0 && otherFields.length > 0 ? (
        <hr className="border-border" />
      ) : null}
      {otherFields.map(input)}
    </section>
  )
}

export { ActivityFields, TypeControl, useActivityType }
