import { useQuery } from "@tanstack/react-query"
import { atom, useAtom } from "jotai"
import { toast } from "sonner"
import { FieldInput } from "@/activities/components/FieldInput"
import { TypeIcon } from "@/activities/components/TypeIcon"
import { TypeMenu } from "@/activities/components/TypeMenu"
import {
  formatFieldValue,
  valuesLostOnTypeChange,
  type FieldValue,
} from "@/activities/fields"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  useChangeActivityType,
  useSetActivityField,
} from "@/local-db/activity-mutations"
import { activityTypesQuery } from "@/local-db/activity-queries"
import type { ActivityRow } from "@/local-db/db"
import { cn } from "@/lib/utils"

type Workspace = { id: string; timezone: string }

type PendingTypeChange = {
  activityId: string
  activityKey: string
  fromName: string
  toTypeId: string | null
  toName: string
  lost: { id: string; name: string; value: string }[]
}

const pendingTypeChangeAtom = atom<PendingTypeChange | null>(null)

const useActivityType = (activity: ActivityRow, workspaceId: string) => {
  const { data: types } = useQuery(activityTypesQuery(workspaceId))
  return {
    types: types ?? [],
    type: types?.find((candidate) => candidate.id === activity.typeId) ?? null,
  }
}

function TypeControl({
  activity,
  activityKey,
  workspace,
  className,
}: {
  activity: ActivityRow
  activityKey: string
  workspace: Workspace
  className: string
}) {
  const { types, type } = useActivityType(activity, workspace.id)
  const changeType = useChangeActivityType(workspace.id)
  const [, setPending] = useAtom(pendingTypeChangeAtom)
  const label = type?.name ?? "No type"

  return (
    <TypeMenu
      types={types}
      value={activity.typeId}
      workspaceId={workspace.id}
      onChange={(typeId) => {
        const lost = valuesLostOnTypeChange(type?.fields ?? [], activity.fields)
        if (lost.length === 0) {
          changeType.mutate({ id: activity.id, typeId })
          return
        }
        setPending({
          activityId: activity.id,
          activityKey,
          fromName: type?.name ?? "No type",
          toTypeId: typeId,
          toName:
            types.find((candidate) => candidate.id === typeId)?.name ??
            "No type",
          lost: lost.map((field) => ({
            id: field.id,
            name: field.name,
            value: formatFieldValue(field, activity.fields[field.id]),
          })),
        })
      }}
      trigger={
        <button
          type="button"
          aria-label={`Type: ${label}`}
          className={className}
        >
          <TypeIcon color={type?.color ?? null} />
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

function ChangeTypeDialog({ workspaceId }: { workspaceId: string }) {
  const [pending, setPending] = useAtom(pendingTypeChangeAtom)
  const changeType = useChangeActivityType(workspaceId)
  const count = pending?.lost.length ?? 0

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Change {pending?.activityKey} from {pending?.fromName} to{" "}
            {pending?.toName}?
          </DialogTitle>
          <DialogDescription>
            {pending?.toName} has none of these {pending?.fromName} fields, so
            their values will be deleted:
          </DialogDescription>
        </DialogHeader>
        <dl className="divide-y rounded-lg border text-sm">
          {pending?.lost.map((entry) => (
            <div
              key={entry.id}
              className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-3 py-2"
            >
              <dt className="text-muted-foreground">{entry.name}</dt>
              <dd className="truncate">{entry.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Status, area, goal, due date and the body stay as they are.
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Keep {pending?.fromName}
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              if (pending) {
                changeType.mutate(
                  { id: pending.activityId, typeId: pending.toTypeId },
                  {
                    onSuccess: () =>
                      toast.success(
                        `${pending.activityKey} is now ${pending.toName}`
                      ),
                    onError: () =>
                      toast.error(`Couldn't change ${pending.activityKey}.`),
                  }
                )
              }
              setPending(null)
            }}
          >
            Delete {count === 1 ? "1 value" : `${count} values`} and change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const setField = useSetActivityField(workspace.id)
  if (!type || type.fields.length === 0) return null

  return (
    <section
      aria-label={`${type.name} fields`}
      className={cn("flex flex-col gap-3", className)}
    >
      {type.fields.map((field) => (
        <FieldInput
          key={field.id}
          field={field}
          value={activity.fields[field.id] as FieldValue | undefined}
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
      ))}
    </section>
  )
}

export { ActivityFields, ChangeTypeDialog, TypeControl, useActivityType }
