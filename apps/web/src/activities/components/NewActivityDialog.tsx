import { Suspense, useRef } from "react"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { useHotkey } from "@tanstack/react-hotkeys"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { atom, useAtom } from "jotai"
import { CalendarDays, ChevronRight, Target, XIcon } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { formatDayLabel } from "@knight-os/server/core"
import { Form } from "@/components/forms/Form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { GoalIcon } from "@/goals/components/GoalIcon"
import { useAppForm } from "@/hooks/form"
import { useCreateActivities } from "@/local-db/activity-mutations"
import { activityTypesQuery, areasQuery } from "@/local-db/activity-queries"
import { goalListQuery } from "@/local-db/goal-queries"
import { cn } from "@/lib/utils"
import { areaDotClassNames } from "../areas"
import {
  createMoreAtom,
  newActivityAtom,
  type NewActivityRequest,
} from "../new-activity"
import { statusName } from "../activity-types"
import type { FieldValue } from "../fields"
import { ACTIVITY_STATUSES } from "../status"
import { AreaMenu } from "./AreaMenu"
import { DueDateMenu } from "./DueDateMenu"
import { FieldInput } from "./FieldInput"
import { GoalMenu } from "./GoalMenu"
import { StatusIcon } from "./StatusIcon"
import { StatusMenu } from "./StatusMenu"
import { TypeIcon } from "./TypeIcon"
import { TypeMenu } from "./TypeMenu"

type NewActivityWorkspace = {
  id: string
  name: string
  slug: string
  timezone: string
}

const newActivitySchema = z.object({
  title: z.string().trim().min(1, "Give the activity a title."),
  notes: z.string(),
  status: z.enum(ACTIVITY_STATUSES),
  areaId: z.string(),
  goalId: z.string().nullable(),
  dueDate: z.string().nullable(),
  typeId: z.string().nullable(),
  fields: z.record(z.string(), z.unknown()),
})

const fieldsOpenAtom = atom(true)

const noFieldValues: Record<string, unknown> = {}

const chipClassName =
  "h-[30px] gap-1.5 rounded-md px-2.5 text-[13px] font-normal max-md:h-11"

const emptyChipClassName = "border-dashed text-muted-foreground"

function NewActivityForm({
  workspace,
  request,
  onCreated,
}: {
  workspace: NewActivityWorkspace
  request: NewActivityRequest
  onCreated: () => void
}) {
  const navigate = useNavigate()
  const [createMore, setCreateMore] = useAtom(createMoreAtom)
  const { data: areas } = useSuspenseQuery(areasQuery(workspace))
  const { data: goals } = useQuery(goalListQuery(workspace.id))
  const { data: types } = useQuery(activityTypesQuery(workspace.id))
  const [fieldsOpen, setFieldsOpen] = useAtom(fieldsOpenAtom)
  const createActivities = useCreateActivities(workspace.id)
  const titleRef = useRef<HTMLInputElement>(null)

  const announceCreated = (created: { id: string; key: string }) =>
    toast.success(`${created.key} created`, {
      action: {
        label: "Open",
        onClick: () =>
          void navigate({
            to: "/$workspace/activities/$activityId",
            params: { workspace: workspace.slug, activityId: created.id },
          }),
      },
    })

  const form = useAppForm({
    defaultValues: {
      title: "",
      notes: "",
      status: "todo" as z.infer<typeof newActivitySchema>["status"],
      areaId: request.areaId ?? areas[0]?.id ?? "",
      goalId: request.goalId,
      dueDate: null as string | null,
      typeId: null as string | null,
      fields: noFieldValues,
    },
    validators: {
      onSubmit: newActivitySchema,
      onSubmitAsync: async ({ value }) => {
        if (!value.areaId) return { form: "Create an area first." }
        const typeStillExists =
          types === undefined ||
          types.some((candidate) => candidate.id === value.typeId)
        const typed = typeStillExists
          ? value
          : { ...value, typeId: null, fields: noFieldValues }
        try {
          const [created] = await createActivities.mutateAsync([
            { id: crypto.randomUUID(), origin: null, ...typed },
          ])
          if (created) announceCreated(created)
        } catch (error) {
          return {
            form:
              error instanceof Error
                ? error.message
                : "Couldn't create the activity.",
          }
        }
        return null
      },
    },
    onSubmit: ({ value }) => {
      if (!createMore) {
        onCreated()
        return
      }
      form.reset(
        { ...value, title: "", notes: "", fields: {} },
        { keepDefaultValues: true }
      )
      titleRef.current?.focus()
    },
  })

  const submit = () => void form.handleSubmit()

  return (
    <Form onSubmit={submit} className="flex flex-col">
      <div
        className="flex flex-col"
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            submit()
          }
        }}
      >
        <div
          aria-hidden
          className="mx-auto mt-2 h-1 w-9 rounded-full bg-border md:hidden"
        />
        <div className="flex items-center justify-between px-4 pt-3.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <form.Subscribe selector={(state) => state.values.areaId}>
              {(areaId) => {
                const area = areas.find((candidate) => candidate.id === areaId)
                return area ? (
                  <span className="flex h-6 items-center gap-1.5 rounded-md bg-muted px-2 text-foreground">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        areaDotClassNames[area.color]
                      )}
                    />
                    {area.key}
                  </span>
                ) : null
              }}
            </form.Subscribe>
            <ChevronRight aria-hidden className="size-3" />
            <DialogTitle className="text-xs font-normal text-muted-foreground">
              New activity
            </DialogTitle>
          </div>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
              />
            }
          >
            <XIcon />
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">
          Give it a title and notes, then set its status, area, goal and due
          date.
        </DialogDescription>

        <div className="flex flex-col gap-1.5 px-5 pt-2.5 pb-1">
          <form.AppForm>
            <form.FormError />
          </form.AppForm>
          <form.Field name="title">
            {(field) => (
              <>
                <label htmlFor="new-activity-title" className="sr-only">
                  Title
                </label>
                <input
                  ref={titleRef}
                  id="new-activity-title"
                  autoFocus
                  autoComplete="off"
                  dir="auto"
                  placeholder="Activity title"
                  aria-invalid={field.state.meta.errors.length > 0}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  className="w-full bg-transparent py-1 text-xl font-semibold outline-none placeholder:text-muted-foreground"
                />
                {field.state.meta.errors.length > 0 ? (
                  <p className="text-xs text-destructive">
                    Give the activity a title.
                  </p>
                ) : null}
              </>
            )}
          </form.Field>
          <form.Field name="notes">
            {(field) => (
              <>
                <label htmlFor="new-activity-notes" className="sr-only">
                  Notes
                </label>
                <textarea
                  id="new-activity-notes"
                  rows={2}
                  dir="auto"
                  placeholder="Add notes or a plan."
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  className="w-full resize-none bg-transparent text-sm leading-normal outline-none placeholder:text-muted-foreground"
                />
              </>
            )}
          </form.Field>
        </div>

        <div className="flex flex-wrap gap-1.5 px-5 pt-2 pb-3.5">
          <form.Field name="typeId">
            {(field) => {
              const type = types?.find(
                (candidate) => candidate.id === field.state.value
              )
              return (
                <TypeMenu
                  types={types ?? []}
                  value={field.state.value}
                  workspaceId={workspace.id}
                  onChange={(typeId) => {
                    field.handleChange(typeId)
                    form.setFieldValue("fields", {})
                  }}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(chipClassName, !type && emptyChipClassName)}
                      aria-label={`Type: ${type?.name ?? "None"}`}
                    >
                      <span data-icon="inline-start" className="flex">
                        <TypeIcon color={type?.color ?? null} />
                      </span>
                      {type?.name ?? "Type"}
                    </Button>
                  }
                />
              )
            }}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.typeId}>
            {(typeId) => {
              const names =
                types?.find((candidate) => candidate.id === typeId)
                  ?.statusNames ?? null
              return (
                <form.Field name="status">
                  {(field) => (
                    <StatusMenu
                      status={field.state.value}
                      names={names}
                      onChange={field.handleChange}
                      trigger={
                        <Button
                          type="button"
                          variant="outline"
                          className={chipClassName}
                          aria-label={`Status: ${statusName(field.state.value, names)}`}
                        >
                          <span data-icon="inline-start" className="flex">
                            <StatusIcon status={field.state.value} />
                          </span>
                          {statusName(field.state.value, names)}
                        </Button>
                      }
                    />
                  )}
                </form.Field>
              )
            }}
          </form.Subscribe>
          <form.Field name="areaId">
            {(field) => {
              const area = areas.find(
                (candidate) => candidate.id === field.state.value
              )
              return (
                <AreaMenu
                  areas={areas}
                  value={field.state.value}
                  heading="Area"
                  onChange={field.handleChange}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(chipClassName, !area && emptyChipClassName)}
                      aria-label={`Area: ${area?.name ?? "None"}`}
                    >
                      <span
                        data-icon="inline-start"
                        className={cn(
                          "size-2 rounded-full",
                          area
                            ? areaDotClassNames[area.color]
                            : "bg-muted-foreground"
                        )}
                      />
                      {area?.name ?? "Area"}
                    </Button>
                  }
                />
              )
            }}
          </form.Field>
          <form.Field name="goalId">
            {(field) => {
              const goal = goals?.find(
                (candidate) => candidate.id === field.state.value
              )
              return (
                <GoalMenu
                  goals={goals ?? []}
                  value={field.state.value}
                  onChange={field.handleChange}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(chipClassName, !goal && emptyChipClassName)}
                      aria-label={`Goal: ${goal?.title || "None"}`}
                    >
                      {goal ? (
                        <span data-icon="inline-start" className="flex">
                          <GoalIcon icon={goal.icon} />
                        </span>
                      ) : (
                        <Target data-icon="inline-start" />
                      )}
                      {goal ? goal.title || "Untitled goal" : "Goal"}
                    </Button>
                  }
                />
              )
            }}
          </form.Field>
          <form.Field name="dueDate">
            {(field) => (
              <DueDateMenu
                value={field.state.value}
                timezone={workspace.timezone}
                onChange={field.handleChange}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      chipClassName,
                      !field.state.value && emptyChipClassName
                    )}
                    aria-label={`Due date: ${field.state.value ? formatDayLabel(field.state.value) : "None"}`}
                  >
                    <CalendarDays data-icon="inline-start" />
                    {field.state.value
                      ? formatDayLabel(field.state.value)
                      : "Due date"}
                  </Button>
                }
              />
            )}
          </form.Field>
        </div>

        <form.Subscribe selector={(state) => state.values.typeId}>
          {(typeId) => {
            const type = types?.find((candidate) => candidate.id === typeId)
            if (!type) return null
            return (
              <div className="mx-5 mb-4 flex flex-col gap-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-expanded={fieldsOpen}
                    onClick={() => setFieldsOpen(!fieldsOpen)}
                    className="flex min-h-7 items-center gap-1.5 text-xs font-semibold text-muted-foreground max-md:min-h-11"
                  >
                    <ChevronRight
                      aria-hidden
                      className={cn(
                        "size-3 transition-transform",
                        fieldsOpen && "rotate-90"
                      )}
                    />
                    {type.name} fields
                    {fieldsOpen ? null : (
                      <span className="font-normal">
                        ·{" "}
                        {type.fields.length === 1
                          ? "1 field"
                          : `${type.fields.length} fields`}
                      </span>
                    )}
                  </button>
                  <Link
                    to="/$workspace/settings/activity-types/$typeId"
                    params={{ workspace: workspace.slug, typeId: type.id }}
                    className="flex min-h-7 items-center text-xs text-accent-text hover:underline max-md:min-h-11"
                  >
                    {type.fields.length === 0
                      ? "Add fields in Settings"
                      : "Edit in Settings"}
                  </Link>
                </div>
                {fieldsOpen && type.fields.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {type.name} has no fields yet.
                  </p>
                ) : null}
                {fieldsOpen && type.fields.length > 0 ? (
                  <form.Field name="fields">
                    {(field) => (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {type.fields.map((definition) => (
                          <FieldInput
                            key={definition.id}
                            field={definition}
                            value={
                              field.state.value[definition.id] as
                                FieldValue | undefined
                            }
                            timezone={workspace.timezone}
                            onChange={(next) => {
                              const rest = Object.fromEntries(
                                Object.entries(field.state.value).filter(
                                  ([id]) => id !== definition.id
                                )
                              )
                              field.handleChange(
                                next === null || next === ""
                                  ? rest
                                  : { ...rest, [definition.id]: next }
                              )
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </form.Field>
                ) : null}
              </div>
            )
          }}
        </form.Subscribe>

        <div className="flex items-center justify-between gap-3 border-t px-4 py-3 max-md:sticky max-md:bottom-0 max-md:bg-popover max-md:pb-7">
          <Field orientation="horizontal" className="w-auto max-md:hidden">
            <Switch
              id="create-more"
              checked={createMore}
              onCheckedChange={setCreateMore}
            />
            <FieldLabel
              htmlFor="create-more"
              className="font-normal text-muted-foreground"
            >
              Create more
            </FieldLabel>
          </Field>
          <div className="flex gap-2 max-md:flex-1">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="max-md:hidden"
                />
              }
            >
              Cancel
            </DialogClose>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="max-md:h-12 max-md:flex-1"
                >
                  Create activity
                  <kbd className="font-sans text-[11px] opacity-80 max-md:hidden">
                    Ctrl ↵
                  </kbd>
                </Button>
              )}
            </form.Subscribe>
          </div>
        </div>
      </div>
    </Form>
  )
}

function NewActivityDialog({ workspace }: { workspace: NewActivityWorkspace }) {
  const [{ open, request }, setDialog] = useAtom(newActivityAtom)
  const activitiesSearch = useSearch({
    from: "/_authenticated/$workspace/_app/activities/",
    shouldThrow: false,
  })
  useHotkey(
    "C",
    () => {
      // Other dialogs (new area, change type) hold focus while open; C belongs to them then.
      if (document.activeElement?.closest("[role=dialog], [role=alertdialog]"))
        return
      setDialog({
        open: true,
        request: { areaId: activitiesSearch?.area ?? null, goalId: null },
      })
    },
    { enabled: !open }
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog({ open: next, request })}
      onOpenChangeComplete={(next) => {
        if (!next) setDialog({ open: false, request: null })
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[72px] translate-y-0 gap-0 p-0 text-sm max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:max-h-[90dvh] max-md:max-w-full max-md:translate-x-0 max-md:overflow-y-auto max-md:rounded-b-none sm:max-w-[860px] max-md:data-open:zoom-in-100 max-md:data-open:slide-in-from-bottom max-md:data-closed:zoom-out-100 max-md:data-closed:slide-out-to-bottom"
      >
        {request ? (
          <Suspense fallback={<Skeleton className="m-5 h-36" />}>
            <NewActivityForm
              workspace={workspace}
              request={request}
              onCreated={() => setDialog({ open: false, request })}
            />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export { NewActivityDialog }
