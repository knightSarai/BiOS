import { useMemo } from "react"
import { atom, useAtom, useAtomValue } from "jotai"
import { CalendarClock, ChevronDown } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useAppForm } from "@/hooks/form"
import { useLogTime } from "@/local-db/activity-mutations"
import { InvalidLogError } from "@/local-db/time-entries"
import { valueToSeconds } from "../duration"
import {
  addTimeDraft,
  logPlan,
  offerShown,
  waitingOf,
  whenLabel,
  whenNow,
  type Counted,
  type Offer,
  type When,
} from "../log-time"
import type { RoutineNode } from "../routine"
import { timerActionsAtom, type Routine } from "../use-routine"
import { DurationChip } from "./DurationField"

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
  // A time picked by hand replaces the timer's exact stop.
  const picked = value
    ? { date: value.date, time: value.time }
    : whenNow(timezone, at)
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
        <ChevronDown className="text-muted-foreground" />
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

// The offer to add time belongs to one visit of the activity's page and to what opened it:
// the Status (after Done) or the Timer row's Add time. What Done counted is kept for this
// visit until it's saved, so Add time opened by hand starts from it too; leaving the page
// drops it, and any timer action on its routine after it was made makes it stale.
type OfferedFrom = "status" | "timer"

const useAddTimeOffer = (routineId: string) => {
  // Identity matters: one atom per page's Status and Timer, so its state ends with them.
  const offerAtom = useMemo(() => atom<Offer | null>(null), [])
  const [offer, setOffer] = useAtom(offerAtom)
  const actions = useAtomValue(timerActionsAtom)[routineId] ?? 0
  const current = offer !== null && offer.actions === actions
  return {
    open: current && offer.open,
    // Kept after closing, so the popover leaves from where it opened.
    from: offer?.from ?? "timer",
    counted: current ? offer.counted : null,
    show: (from: OfferedFrom, counted?: Counted | null) =>
      setOffer((was) => offerShown(was, from, counted, actions)),
    close: () => setOffer((was) => (was ? { ...was, open: false } : was)),
    forget: () => setOffer(null),
    saved: () =>
      setOffer((was) => (was ? { ...was, open: false, counted: null } : was)),
  }
}

type AddTimeOffer = ReturnType<typeof useAddTimeOffer>

const fieldLabel = "w-16 shrink-0 text-sm text-muted-foreground"

// How long and when it ended, then Save. Right after Done, Skip leaves it done with no time;
// opened by hand, Cancel just closes it.
function AddTimeForm({
  timer,
  node,
  counted,
  timezone,
  dismiss,
  onClose,
  onSaved,
}: {
  timer: Routine
  node: RoutineNode
  counted: Counted | null
  timezone: string
  dismiss: "Skip" | "Cancel"
  onClose: () => void
  onSaved: () => void
}) {
  const logTime = useLogTime(timer.workspaceId)
  const form = useAppForm({
    defaultValues: addTimeDraft(
      counted ?? waitingOf(node, timer.session.run),
      timezone
    ),
    validators: {
      onSubmitAsync: async ({ value }) => {
        const plan = logPlan(node, value, timezone, parseUtc(now()))
        if ("error" in plan) return { form: plan.error }
        try {
          await logTime.mutateAsync(plan)
        } catch (error) {
          return {
            form:
              error instanceof InvalidLogError
                ? error.message
                : "Couldn't save the time.",
          }
        }
        return null
      },
    },
    onSubmit: () => {
      onSaved()
      toast.success(`Added time to ${node.title || "the activity"}`)
    },
  })

  return (
    <Form
      onSubmit={() => void form.handleSubmit()}
      className="flex flex-col gap-3"
    >
      <form.AppForm>
        <form.FormError />
      </form.AppForm>
      <form.Subscribe selector={(state) => state.values.took}>
        {(took) => (
          <div className="flex items-center gap-2">
            <span className={fieldLabel}>How long</span>
            <DurationChip
              value={took}
              label="How long it took"
              zeroLabel=""
              downLabel={valueToSeconds(took) >= 3600 ? "h:min:s" : "min:s"}
              title="How long it took"
              onChange={(next) => form.setFieldValue("took", next)}
            />
          </div>
        )}
      </form.Subscribe>
      <form.Subscribe selector={(state) => state.values.when}>
        {(when) => (
          <div className="flex items-center gap-2">
            <span className={fieldLabel}>Ended</span>
            <WhenField
              value={when}
              timezone={timezone}
              onChange={(next) => form.setFieldValue("when", next)}
            />
          </div>
        )}
      </form.Subscribe>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="max-md:h-11 max-md:flex-1"
          onClick={onClose}
        >
          {dismiss}
        </Button>
        <form.Subscribe
          selector={(state) =>
            [state.isSubmitting, valueToSeconds(state.values.took)] as const
          }
        >
          {([isSubmitting, seconds]) => (
            <Button
              type="submit"
              disabled={isSubmitting || seconds === 0}
              className="max-md:h-11 max-md:flex-1"
            >
              Save
            </Button>
          )}
        </form.Subscribe>
      </div>
    </Form>
  )
}

// Over the page, never pushing it down: anchored to what opened it on a wide screen, a sheet
// from the bottom on a phone.
function AddTime({
  timer,
  node,
  offer,
  anchors,
  timezone,
  variant,
}: {
  timer: Routine
  node: RoutineNode
  offer: AddTimeOffer
  anchors: Record<OfferedFrom, React.RefObject<HTMLElement | null>>
  timezone: string
  variant: "popover" | "sheet"
}) {
  const form = (
    <AddTimeForm
      timer={timer}
      node={node}
      counted={offer.counted}
      timezone={timezone}
      dismiss={offer.from === "status" ? "Skip" : "Cancel"}
      onClose={offer.close}
      onSaved={offer.saved}
    />
  )
  if (variant === "sheet") {
    return (
      <Sheet
        open={offer.open}
        onOpenChange={(open) => {
          if (!open) offer.close()
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-xl px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="mb-3 text-sm font-medium">Add time</SheetTitle>
          {form}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Popover
      open={offer.open}
      onOpenChange={(open) => {
        if (!open) offer.close()
      }}
    >
      <PopoverContent
        anchor={anchors[offer.from]}
        align="start"
        className="w-72 gap-3 p-3"
      >
        <PopoverTitle>Add time</PopoverTitle>
        {form}
      </PopoverContent>
    </Popover>
  )
}

export { AddTime, WhenField, useAddTimeOffer }
export type { AddTimeOffer }
