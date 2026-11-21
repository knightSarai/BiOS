import { atom, useAtom, useSetAtom } from "jotai"
import { CalendarClock, PenLine } from "lucide-react"
import { toast } from "sonner"
import {
  now,
  parseCivilDate,
  parseUtc,
  toCivilDate,
  toLocalDate,
} from "@knight-os/server/core"
import { Form } from "@/components/forms/Form"
import { calendarBounds } from "@/components/forms/calendar-bounds"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { useAppForm } from "@/hooks/form"
import { useLogTime } from "@/local-db/activity-mutations"
import { InvalidLogError } from "@/local-db/time-entries"
import { cn } from "@/lib/utils"
import { valueToSeconds } from "../duration"
import {
  logPlan,
  marksDone,
  splitRows,
  tookDefault,
  whenLabel,
  whenNow,
  type LogDraft,
  type When,
} from "../log-time"
import { isCanceled, type RoutineNode } from "../routine"
import { clock } from "../routine-view"
import type { Routine, Surface } from "../use-routine"
import { DurationChip, DurationDigits } from "./DurationField"
import { TypeMark } from "./TypeMark"

// Keyed by activity, so moving to another activity's page closes the form.
const logTimeOpenAtom = atom<{ id: string; surface: Surface } | null>(null)

const chipClassName =
  "h-[30px] gap-1.5 rounded-md bg-background px-2.5 text-[13px] font-normal max-md:h-11"

function WhenField({
  value,
  timezone,
  onChange,
}: {
  value: When
  timezone: string
  onChange: (when: When) => void
}) {
  const at = parseUtc(now())
  const today = toLocalDate(at, timezone)
  const picked = value ?? whenNow(timezone, at)
  const label = whenLabel(value, timezone, at)
  const bounds = calendarBounds()
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={chipClassName}
            aria-label={`Ended: ${label}`}
          />
        }
      >
        <CalendarClock data-icon="inline-start" />
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-2 p-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={value === null ? "secondary" : "ghost"}
            size="sm"
            className="max-md:h-11"
            onClick={() => onChange(null)}
          >
            Just now
          </Button>
          <label className="ml-auto flex items-center gap-1.5 text-muted-foreground">
            at
            <Input
              type="time"
              aria-label="Ended at"
              value={picked.time}
              onChange={(event) => {
                if (event.target.value) {
                  onChange({ ...picked, time: event.target.value })
                }
              }}
              className="h-8 w-28 tabular-nums max-md:h-11"
            />
          </label>
        </div>
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={bounds.startMonth}
          endMonth={parseCivilDate(today)}
          disabled={{ after: parseCivilDate(today) }}
          defaultMonth={parseCivilDate(picked.date)}
          selected={parseCivilDate(picked.date)}
          onSelect={(date) => {
            if (date) onChange({ ...picked, date: toCivilDate(date) })
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

// One compact row per timed activity, so a long routine still fits a phone.
function SplitRows({
  timer,
  node,
  parts,
  onChange,
}: {
  timer: Routine
  node: RoutineNode
  parts: Record<string, string>
  onChange: (id: string, took: string) => void
}) {
  const rows = splitRows(node, timer.session.run, timer.routine)
  const total = rows.reduce(
    (sum, row) => sum + valueToSeconds(parts[row.node.id] ?? row.took),
    0
  )
  return (
    <div className="flex flex-col gap-1">
      <ul className="flex max-h-72 flex-col overflow-y-auto rounded-lg border bg-background">
        {rows.map((row) => {
          const took = parts[row.node.id] ?? row.took
          return (
            <li
              key={row.node.id}
              className="flex min-h-9 items-center gap-2 border-b px-2.5 last:border-b-0 max-md:min-h-11"
            >
              <TypeMark type={timer.typeOf(row.node)} />
              <span
                dir="auto"
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  valueToSeconds(took) === 0 && "text-muted-foreground"
                )}
              >
                {row.node.title || "Untitled"}
              </span>
              <DurationDigits
                value={took}
                label={`${row.node.title} took`}
                onChange={(next) => onChange(row.node.id, next)}
                className="rounded px-1 text-right text-sm focus:bg-accent"
              />
            </li>
          )
        })}
      </ul>
      <span className="flex justify-between px-1 text-xs text-muted-foreground">
        <span>Ones left at 00:00 aren’t logged and stay open</span>
        <span className="tabular-nums">Total {clock(total)}</span>
      </span>
    </div>
  )
}

function LogTimeForm({
  timer,
  node,
  timezone,
}: {
  timer: Routine
  node: RoutineNode
  timezone: string
}) {
  const setOpen = useSetAtom(logTimeOpenAtom)
  const logTime = useLogTime(timer.workspaceId)
  const canSplit = node.children.length > 0
  const canceled = isCanceled(timer.session.run, node.id)
  const defaultValues: LogDraft = {
    split: false,
    took: tookDefault(node, timer.session.run, timer.routine),
    parts: {},
    when: null,
    done: !canceled,
  }
  const form = useAppForm({
    defaultValues,
    validators: {
      onSubmitAsync: async ({ value }) => {
        const plan = logPlan(
          node,
          timer.session.run,
          timer.routine,
          value,
          timezone,
          parseUtc(now())
        )
        if ("error" in plan) return { form: plan.error }
        try {
          await logTime.mutateAsync(plan)
        } catch (error) {
          return {
            form:
              error instanceof InvalidLogError
                ? error.message
                : "Couldn't log the time.",
          }
        }
        return null
      },
    },
    onSubmit: ({ value }) => {
      setOpen(null)
      toast.success(
        marksDone(node, timer.session.run, value)
          ? `Logged and marked ${node.title || "it"} done`
          : `Logged on ${node.title || "the activity"}`
      )
    },
  })

  return (
    <Form
      onSubmit={() => void form.handleSubmit()}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">Log time</span>
        <span className="text-xs text-muted-foreground">
          For a session you did without the timer.
        </span>
      </div>
      <form.AppForm>
        <form.FormError />
      </form.AppForm>
      <form.Subscribe
        selector={(state) =>
          [state.values.split, state.values.took, state.values.parts] as const
        }
      >
        {([split, took, parts]) =>
          split ? (
            <SplitRows
              timer={timer}
              node={node}
              parts={parts}
              onChange={(id, next) =>
                form.setFieldValue("parts", { ...parts, [id]: next })
              }
            />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-12 shrink-0 text-foreground/75">Took</span>
              <DurationChip
                value={took}
                label="How long it took"
                zeroLabel=""
                title="Type how long it took over 00:00"
                onChange={(next) => form.setFieldValue("took", next)}
              />
            </div>
          )
        }
      </form.Subscribe>
      <form.Subscribe selector={(state) => state.values.when}>
        {(when) => (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-12 shrink-0 text-foreground/75">Ended</span>
            <WhenField
              value={when}
              timezone={timezone}
              onChange={(next) => form.setFieldValue("when", next)}
            />
          </div>
        )}
      </form.Subscribe>
      {canSplit ? (
        <form.Subscribe selector={(state) => state.values.split}>
          {(split) => (
            <label className="flex min-h-7 items-center gap-2 text-sm max-md:min-h-11">
              <Switch
                checked={split}
                onCheckedChange={(next) => form.setFieldValue("split", next)}
              />
              Split by sub-activity
            </label>
          )}
        </form.Subscribe>
      ) : null}
      {canceled ? null : (
        <form.Subscribe
          selector={(state) => [state.values.done, state.values.split] as const}
        >
          {([done, split]) => (
            <label className="flex min-h-7 items-center gap-2 text-sm max-md:min-h-11">
              <Checkbox
                checked={done}
                onCheckedChange={(next) => form.setFieldValue("done", next)}
              />
              {split
                ? `Mark the logged ones and ${node.title || "this"} done`
                : "Mark done"}
            </label>
          )}
        </form.Subscribe>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-11 flex-1 rounded-full"
          onClick={() => setOpen(null)}
        >
          Cancel
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-11 flex-1 rounded-full bg-foreground font-semibold text-background hover:bg-foreground/85"
            >
              Log time
            </Button>
          )}
        </form.Subscribe>
      </div>
    </Form>
  )
}

function useLogTimeOpen(activityId: string, surface: Surface) {
  const [openFor, setOpen] = useAtom(logTimeOpenAtom)
  return {
    open: openFor?.id === activityId && openFor.surface === surface,
    show: () => setOpen({ id: activityId, surface }),
  }
}

// `compact` keeps only the icon on a phone, for the dock's single row.
function LogTimeButton({
  onClick,
  compact = false,
  className,
}: {
  onClick: () => void
  compact?: boolean
  className?: string
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "h-11 shrink-0 rounded-full bg-background px-4 text-sm [&_svg]:size-4",
        compact && "max-sm:size-11 max-sm:px-0",
        className
      )}
      aria-label="Log time"
      title="Log a session you did without the timer"
      onClick={onClick}
    >
      <PenLine data-icon="inline-start" />
      <span className={cn(compact && "max-sm:sr-only")}>Log time</span>
    </Button>
  )
}

export { LogTimeButton, LogTimeForm, WhenField, useLogTimeOpen }
