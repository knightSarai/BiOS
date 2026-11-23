import { useRef } from "react"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { atom, useAtom } from "jotai"
import {
  CalendarDays,
  ChevronRight,
  Minus,
  Plus,
  Repeat,
  Settings,
  Target,
  TriangleAlert,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { formatDayLabel, now, parseUtc } from "@knight-os/server/core"
import { Form } from "@/components/forms/Form"
import { Button } from "@/components/ui/button"
import {
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { GoalIcon } from "@/goals/components/GoalIcon"
import { useAppForm } from "@/hooks/form"
import type { NewActivity } from "@/local-db/activities"
import {
  useAddSeries,
  useCreateActivities,
} from "@/local-db/activity-mutations"
import { activityTypesQuery, areasQuery } from "@/local-db/activity-queries"
import { goalListQuery } from "@/local-db/goal-queries"
import { logProblem, type LoggedSession } from "@/local-db/time-entries"
import { cn } from "@/lib/utils"
import { EMPTY, secondsToValue, valueToSeconds } from "../duration"
import { backToBack, endOf } from "../log-time"
import { createMoreAtom, type NewActivityRequest } from "../new-activity"
import { statusName, type TypeColor } from "../activity-types"
import { invalidFields, type FieldValue } from "../fields"
import {
  MAX_REPEAT,
  repeatCount,
  repeatLabel,
  seriesSteps,
  stepStatus,
  timerFrom,
} from "../series"
import { ACTIVITY_STATUSES } from "../status"
import type { TimerConfig } from "../timer"
import { AreaMenu } from "./AreaMenu"
import { ColorDot } from "./ColorDot"
import { DueDateMenu } from "./DueDateMenu"
import { DurationChip } from "./DurationField"
import { FieldInput } from "./FieldInput"
import { GoalMenu } from "./GoalMenu"
import { WhenField } from "./LogTime"
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
  // MM:SS as typed; null keeps the type's own timer.
  duration: z.string().nullable(),
  // Kept as typed, so the field can be cleared and retyped; read through `repeatCount`.
  repeatText: z.string(),
  gapTitle: z.string(),
  gapDuration: z.string(),
  gapTypeId: z.string().nullable(),
  // Created as done: how long it took and when it ended, logged as typed-in time.
  took: z.string(),
  when: z.object({ date: z.string(), time: z.string() }).nullable(),
})

type TypeOption = {
  id: string
  name: string
  color: TypeColor
  icon: string | null
  timer: TimerConfig | null
}

const fieldsOpenAtom = atom(true)

const noFieldValues: Record<string, unknown> = {}

const chipClassName =
  "h-[30px] gap-1.5 rounded-md px-2.5 text-[13px] font-normal max-md:h-11"

const emptyChipClassName = "border-dashed text-muted-foreground"

const selectAll = (event: React.FocusEvent<HTMLInputElement>) =>
  event.currentTarget.select()

function TypeGlyph({ type }: { type: TypeOption | null }) {
  return <TypeIcon color={type?.color ?? null} icon={type?.icon ?? null} />
}

type RepeatDraft = {
  repeatText: string
  gapTitle: string
  gapDuration: string
  gapTypeId: string | null
}

// Repeats are their own activities, numbered after the title, with an optional one between
// each: four rounds of scales with a short rest, or three passes over a checklist.
function RepeatChip({
  draft,
  types,
  workspaceId,
  onChange,
}: {
  draft: RepeatDraft
  types: TypeOption[]
  workspaceId: string
  onChange: (patch: Partial<RepeatDraft>) => void
}) {
  const repeat = repeatCount(draft.repeatText)
  const gapType = types.find((type) => type.id === draft.gapTypeId) ?? null
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(chipClassName, repeat <= 1 && emptyChipClassName)}
            aria-label="Repeat"
          />
        }
      >
        <Repeat data-icon="inline-start" />
        {repeatLabel(repeat, {
          title: draft.gapTitle,
          duration: draft.gapDuration,
          typeId: draft.gapTypeId,
          typeName: gapType?.name ?? null,
        })}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-2.5 p-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <label htmlFor="repeat-times">Times</label>
          <span className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 max-md:size-11"
              aria-label="One fewer"
              disabled={repeat <= 1}
              onClick={() => onChange({ repeatText: String(repeat - 1) })}
            >
              <Minus />
            </Button>
            <Input
              id="repeat-times"
              value={draft.repeatText}
              inputMode="numeric"
              onFocus={selectAll}
              onChange={(event) =>
                onChange({ repeatText: event.target.value.replace(/\D/g, "") })
              }
              onBlur={() => onChange({ repeatText: String(repeat) })}
              className="h-8 w-12 text-center tabular-nums max-md:h-11"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 max-md:size-11"
              aria-label="One more"
              disabled={repeat >= MAX_REPEAT}
              onClick={() => onChange({ repeatText: String(repeat + 1) })}
            >
              <Plus />
            </Button>
          </span>
        </div>
        <span className="border-t pt-2.5 text-xs text-muted-foreground">
          Between each (optional)
        </span>
        <div className="flex gap-1.5">
          <Input
            value={draft.gapTitle}
            onChange={(event) => onChange({ gapTitle: event.target.value })}
            onFocus={selectAll}
            placeholder="Name"
            aria-label="Name of the one between repeats"
            className="h-8 min-w-0 flex-1 max-md:h-11"
          />
          <DurationChip
            value={draft.gapDuration}
            label="Duration between repeats"
            zeroLabel=""
            className="h-8 px-2 max-md:h-11"
            onChange={(gapDuration) => onChange({ gapDuration })}
          />
          <TypeMenu
            types={types}
            value={draft.gapTypeId}
            workspaceId={workspaceId}
            onChange={(gapTypeId) => onChange({ gapTypeId })}
            trigger={
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8 shrink-0 max-md:size-11"
                aria-label={`Type between: ${gapType?.name ?? "None"}`}
                title={gapType?.name ?? "Type"}
              >
                <TypeGlyph type={gapType} />
              </Button>
            }
          />
        </div>
        <span className="text-xs text-muted-foreground">
          Each repeat is its own activity, numbered after the title, with the
          one between in its own row.
        </span>
      </PopoverContent>
    </Popover>
  )
}

// The dialog creates one activity at a time; the inline form, under a parent's
// sub-activities, stays open for the next one, as in Linear.
function NewActivityForm({
  workspace,
  request,
  variant,
  notice = null,
  onClose,
}: {
  workspace: NewActivityWorkspace
  request: NewActivityRequest
  variant: "dialog" | "inline"
  // A warning about what adding sub-activities changes on the parent.
  notice?: string | null
  onClose: () => void
}) {
  const inline = variant === "inline"
  const navigate = useNavigate()
  const [createMore, setCreateMore] = useAtom(createMoreAtom)
  const { data: areas } = useSuspenseQuery(areasQuery(workspace))
  const { data: goals } = useQuery(goalListQuery(workspace.id))
  const { data: types } = useQuery(activityTypesQuery(workspace.id))
  const [fieldsOpen, setFieldsOpen] = useAtom(fieldsOpenAtom)
  const createActivities = useCreateActivities(workspace.id)
  const addSeries = useAddSeries(workspace.id)
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
      typeId: request.typeId,
      fields: noFieldValues,
      duration: null as string | null,
      repeatText: "1",
      gapTitle: "",
      gapDuration: EMPTY,
      gapTypeId: null as string | null,
      took: EMPTY,
      when: null as z.infer<typeof newActivitySchema>["when"],
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
        const typeFields =
          types?.find((candidate) => candidate.id === typed.typeId)?.fields ??
          []
        const invalid = invalidFields(typeFields, typed.fields)
        if (invalid.length > 0) {
          return {
            form: `Fix ${invalid.map((field) => field.name).join(", ")} before creating the activity.`,
          }
        }
        // Checked before anything is created, so a bad Took never leaves a half-made activity.
        const at = parseUtc(now())
        const sessions =
          typed.status === "done"
            ? backToBack(
                [{ activityId: "", seconds: valueToSeconds(typed.took) }],
                endOf(typed.when, workspace.timezone, at)
              )
            : []
        const problem = logProblem(sessions, at)
        if (problem) return { form: problem }
        try {
          const created = await create(typed, sessions)
          if (created && !inline) announceCreated(created)
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
      if (!inline && !createMore) {
        onClose()
        return
      }
      form.reset(
        {
          ...value,
          title: "",
          notes: "",
          fields: {},
          duration: null,
          repeatText: "1",
          gapTitle: "",
          gapDuration: EMPTY,
          gapTypeId: null,
          took: EMPTY,
          when: null,
        },
        { keepDefaultValues: true }
      )
      titleRef.current?.focus()
    },
  })

  // One activity, or a series of repeats under the parent or a new activity that holds
  // them. Time typed in is saved in the same write.
  const create = async (
    value: z.infer<typeof newActivitySchema>,
    sessions: LoggedSession[]
  ) => {
    const spans = sessions.map(({ startedAt, endedAt }) => ({
      startedAt,
      endedAt,
    }))
    const loggedOn = (activityId: string) =>
      spans.map((span) => ({ ...span, activityId }))
    const type = types?.find((candidate) => candidate.id === value.typeId)
    const gapType = types?.find((candidate) => candidate.id === value.gapTypeId)
    const sound = type?.timer?.sound ?? "none"
    const timer =
      value.duration === null ? null : timerFrom(value.duration, sound)
    const steps = seriesSteps({
      title: value.title.trim(),
      timer,
      typeId: value.typeId,
      repeat: repeatCount(value.repeatText),
      gap: {
        title: value.gapTitle,
        duration: value.gapDuration,
        typeId: gapType?.id ?? null,
        typeName: gapType?.name ?? null,
      },
      sound,
    })
    const own = {
      origin: null,
      areaId: value.areaId,
      goalId: value.goalId,
      title: value.title,
      notes: value.notes,
      status: value.status,
      dueDate: value.dueDate,
      typeId: value.typeId,
      fields: value.fields,
    }
    if (steps.length === 1) {
      const id = crypto.randomUUID()
      const [created] = await createActivities.mutateAsync({
        activities: [
          { ...own, id, parentId: request.parent?.id ?? null, timer },
        ],
        logged: loggedOn(id),
      })
      return created
    }
    const repeats = steps.map((step): NewActivity => {
      const gap = step.generated === "gap"
      return {
        id: crypto.randomUUID(),
        origin: null,
        areaId: value.areaId,
        goalId: value.goalId,
        title: step.title,
        typeId: step.typeId,
        timer: step.timer,
        generated: step.generated,
        status: stepStatus(step, value.status),
        dueDate: gap ? null : value.dueDate,
        fields: gap ? {} : value.fields,
        notes: gap || !request.parent ? "" : value.notes,
      }
    })
    // The holder is the routine's top, which carries its one sound.
    const holder = {
      ...own,
      id: crypto.randomUUID(),
      timer: { mode: "up" as const, sound },
    }
    if (request.parent) {
      const [created] = await addSeries.mutateAsync({
        parentId: request.parent.id,
        holder,
        repeats,
        logged: spans,
      })
      return created
    }
    const [created] = await createActivities.mutateAsync({
      activities: [
        { ...holder, parentId: null, series: true },
        ...repeats.map((repeat) => ({ ...repeat, parentId: holder.id })),
      ],
      logged: loggedOn(holder.id),
    })
    return created
  }

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
          if (inline && event.key === "Escape") {
            event.preventDefault()
            onClose()
          }
        }}
      >
        {inline ? null : (
          <>
            <div
              aria-hidden
              className="mx-auto mt-2 h-1 w-9 rounded-full bg-border md:hidden"
            />
            <div className="flex items-center justify-between px-4 pt-3.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <form.Subscribe selector={(state) => state.values.areaId}>
                  {(areaId) => {
                    const area = areas.find(
                      (candidate) => candidate.id === areaId
                    )
                    return area ? (
                      <span className="flex h-6 items-center gap-1.5 rounded-md bg-muted px-2 text-foreground">
                        <ColorDot color={area.color} className="size-2" />
                        {area.key}
                      </span>
                    ) : null
                  }}
                </form.Subscribe>
                <ChevronRight aria-hidden className="size-3" />
                {request.parent ? (
                  <>
                    <span className="text-foreground tabular-nums">
                      {request.parent.key}
                    </span>
                    <ChevronRight aria-hidden className="size-3" />
                  </>
                ) : null}
                <DialogTitle className="text-xs font-normal text-muted-foreground">
                  {request.parent ? "New sub-activity" : "New activity"}
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
          </>
        )}

        {notice ? (
          <p className="mx-5 mt-3.5 flex items-start gap-2 rounded-md bg-warning-bg px-3 py-2 text-xs text-warning-text">
            <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>{notice}</span>
          </p>
        ) : null}
        <div
          className={cn(
            "flex flex-col gap-1.5 px-5 pb-1",
            inline ? "pt-3.5" : "pt-2.5"
          )}
        >
          <form.AppForm>
            <form.FormError />
          </form.AppForm>
          <form.Field name="title">
            {(field) => (
              <>
                <label
                  htmlFor={`${variant}-activity-title`}
                  className="sr-only"
                >
                  Title
                </label>
                <input
                  ref={titleRef}
                  id={`${variant}-activity-title`}
                  autoFocus
                  autoComplete="off"
                  dir="auto"
                  placeholder={inline ? "Sub-activity title" : "Activity title"}
                  aria-invalid={field.state.meta.errors.length > 0}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  className={cn(
                    "w-full bg-transparent py-1 outline-none placeholder:text-muted-foreground",
                    inline ? "text-base font-medium" : "text-xl font-semibold"
                  )}
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
                <label
                  htmlFor={`${variant}-activity-notes`}
                  className="sr-only"
                >
                  Notes
                </label>
                <textarea
                  id={`${variant}-activity-notes`}
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
                    const kept = new Set(
                      types
                        ?.find((candidate) => candidate.id === typeId)
                        ?.fields.map((definition) => definition.id)
                    )
                    form.setFieldValue("fields", (values) =>
                      Object.fromEntries(
                        Object.entries(values).filter(([id]) => kept.has(id))
                      )
                    )
                  }}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(chipClassName, !type && emptyChipClassName)}
                      aria-label={`Type: ${type?.name ?? "None"}`}
                    >
                      <span data-icon="inline-start" className="flex">
                        <TypeGlyph type={type ?? null} />
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
                      <ColorDot
                        data-icon="inline-start"
                        color={area?.color ?? null}
                        className="size-2"
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
          <form.Subscribe
            selector={(state) =>
              [state.values.typeId, state.values.duration] as const
            }
          >
            {([typeId, duration]) => {
              const typeTimer =
                types?.find((candidate) => candidate.id === typeId)?.timer ??
                null
              return (
                <DurationChip
                  value={
                    duration ??
                    (typeTimer?.mode === "down"
                      ? secondsToValue(typeTimer.seconds)
                      : EMPTY)
                  }
                  label="Timer duration"
                  zeroLabel="stopwatch"
                  downLabel="countdown"
                  onChange={(next) => form.setFieldValue("duration", next)}
                />
              )
            }}
          </form.Subscribe>
          <form.Subscribe
            selector={(state) => ({
              repeatText: state.values.repeatText,
              gapTitle: state.values.gapTitle,
              gapDuration: state.values.gapDuration,
              gapTypeId: state.values.gapTypeId,
            })}
          >
            {(draft) => (
              <RepeatChip
                draft={draft}
                types={types ?? []}
                workspaceId={workspace.id}
                onChange={(patch) => {
                  if (patch.repeatText !== undefined) {
                    form.setFieldValue("repeatText", patch.repeatText)
                  }
                  if (patch.gapTitle !== undefined) {
                    form.setFieldValue("gapTitle", patch.gapTitle)
                  }
                  if (patch.gapDuration !== undefined) {
                    form.setFieldValue("gapDuration", patch.gapDuration)
                  }
                  if (patch.gapTypeId !== undefined) {
                    form.setFieldValue("gapTypeId", patch.gapTypeId)
                  }
                }}
              />
            )}
          </form.Subscribe>
        </div>

        <form.Subscribe
          selector={(state) =>
            [state.values.status, state.values.took, state.values.when] as const
          }
        >
          {([status, took, when]) =>
            status === "done" ? (
              <div className="-mt-1.5 flex flex-wrap items-center gap-1.5 px-5 pb-3.5 text-xs text-muted-foreground">
                <span>Took</span>
                <DurationChip
                  value={took}
                  label="How long it took"
                  zeroLabel="optional"
                  title="Type how long it took over 00:00; leave it to just mark it done"
                  onChange={(next) => form.setFieldValue("took", next)}
                />
                <span>ended</span>
                <WhenField
                  value={when}
                  timezone={workspace.timezone}
                  onChange={(next) => form.setFieldValue("when", next)}
                />
              </div>
            ) : null
          }
        </form.Subscribe>

        <form.Subscribe selector={(state) => state.values.typeId}>
          {(typeId) => {
            const type = types?.find((candidate) => candidate.id === typeId)
            if (!type) return null
            return (
              <div className="mx-5 mb-3 flex flex-col">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-expanded={fieldsOpen}
                    onClick={() => setFieldsOpen(!fieldsOpen)}
                    className="flex min-h-7 min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground max-md:min-h-11"
                  >
                    <ChevronRight
                      aria-hidden
                      className={cn(
                        "size-3 transition-transform",
                        fieldsOpen && "rotate-90"
                      )}
                    />
                    <span className="text-left">{type.name}</span>
                    <span className="sr-only"> fields</span>
                    {fieldsOpen ? null : (
                      <span className="shrink-0 font-normal">
                        ·{" "}
                        {type.fields.length === 1
                          ? "1 field"
                          : `${type.fields.length} fields`}
                      </span>
                    )}
                  </button>
                  <Separator aria-hidden className="min-w-4 flex-1" />
                  <Link
                    to="/$workspace/settings/activity-types/$typeId"
                    params={{ workspace: workspace.slug, typeId: type.id }}
                    aria-label={`Edit ${type.name} fields in Settings`}
                    title="Edit in Settings"
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-11"
                  >
                    <Settings aria-hidden className="size-3.5" />
                  </Link>
                </div>
                {fieldsOpen && type.fields.length === 0 ? (
                  <p className="pt-1 text-xs text-muted-foreground">
                    {type.name} has no fields yet.{" "}
                    <Link
                      to="/$workspace/settings/activity-types/$typeId"
                      params={{ workspace: workspace.slug, typeId: type.id }}
                      className="text-accent-text hover:underline"
                    >
                      Add fields in Settings
                    </Link>
                  </p>
                ) : null}
                {fieldsOpen && type.fields.length > 0 ? (
                  <form.Field name="fields">
                    {(field) => (
                      <div className="mt-1 flex flex-col">
                        {type.fields.map((definition) => (
                          <FieldInput
                            key={definition.id}
                            field={definition}
                            value={
                              field.state.value[definition.id] as
                                FieldValue | undefined
                            }
                            timezone={workspace.timezone}
                            layout="row"
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

        {inline ? (
          <div className="flex items-center justify-end gap-2 px-4 pb-3">
            <Button
              type="button"
              variant="ghost"
              className="max-md:h-11"
              onClick={onClose}
            >
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) =>
                [
                  state.isSubmitting,
                  repeatCount(state.values.repeatText),
                ] as const
              }
            >
              {([isSubmitting, repeat]) => (
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={isSubmitting}
                  className="max-md:h-11"
                >
                  {repeat > 1 ? `Create ${repeat}` : "Create"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        ) : (
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
        )}
      </div>
    </Form>
  )
}

export { NewActivityForm }
export type { NewActivityWorkspace }
