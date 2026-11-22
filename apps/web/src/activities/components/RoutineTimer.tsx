import { useId, useRef } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "@tanstack/react-router"
import { useAtom, useSetAtom } from "jotai"
import {
  ArrowLeft,
  BellRing,
  Check,
  ChevronDown,
  Ellipsis,
  ListRestart,
  Flag,
  Focus,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Timer,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  useSetActivitySound,
  useSetActivityStatus,
  useSetActivityTimer,
} from "@/local-db/activity-mutations"
import { activityQuery } from "@/local-db/activity-queries"
import { cn } from "@/lib/utils"
import { statusName, type StatusNames } from "../activity-types"
import { EMPTY, secondsToValue } from "../duration"
import { countedOf } from "../log-time"
import {
  faceOf,
  findNode,
  isCanceled,
  leafProgress,
  leafWeight,
  nodesOf,
  plannedSeconds,
  heldSeconds,
  type RoutineNode,
} from "../routine"
import {
  actualVersusPlanned,
  clock,
  replayOf,
  controlsOf,
  isLive,
  isPaused,
  jumpHint,
  offersStartOver,
  partOf,
  progressText,
  stepSuffix,
  summaryOf,
  timeLeft,
  timerEnded,
  timerTargetId,
  type Primary,
} from "../routine-view"
import { timerFrom } from "../series"
import {
  TIMER_SOUNDS,
  formatClock,
  timerSoundLabels,
  type TimerSound,
} from "../timer"
import type { ActivityStatus } from "../status"
import { previewSound } from "../timer-runner"
import {
  confirmStartOverAtom,
  useFullScreen,
  type Routine,
  type Surface,
} from "../use-routine"
import { swatchStyle } from "./ColorDot"
import { DurationDigits } from "./DurationField"
import type { AddTimeOffer } from "./LogTime"
import { StatusIcon } from "./StatusIcon"
import { TimerConfigEditor } from "./TimerConfigEditor"
import { StatusMenu } from "./StatusMenu"
import { TypeMark, type TimerType } from "./TypeMark"

const ACTIVITY_PATH = "/$workspace/activities/$activityId"

// The running activity tints full screen with its type's colour, so a rest reads differently
// from a round at a glance without the app ever guessing from the title.
const typeStyle = (type: TimerType | null) =>
  type ? swatchStyle(type.color) : undefined

const tintedType = (timer: Routine) =>
  isLive(timer.session) ? timer.typeOf(timer.session.current?.node) : null

const runningType = (timer: Routine) =>
  timer.session.phase === "running" ? tintedType(timer) : null

const primaryIcons: Record<Primary["icon"], typeof Play> = {
  pause: Pause,
  play: Play,
  again: RotateCw,
}

// Play and Pause read as solid glyphs; Do again's open arc would fill into a blob.
const filledIcon = (icon: Primary["icon"]) =>
  icon === "again" ? undefined : "fill-current"

// Previous, and its arrow key, only where the timer has more than one activity to step between.
const stepsBack = (timer: Routine) => timer.session.scoped.length > 1

// One tab stop for the whole bar; the arrow keys move between its activities.
const moveAlongBar = (event: React.KeyboardEvent<HTMLElement>) => {
  const buttons = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)"
    ),
  ]
  const index = buttons.findIndex((button) => button === event.target)
  if (index < 0) return
  const target = {
    ArrowRight: buttons[index + 1],
    ArrowLeft: buttons[index - 1],
    Home: buttons[0],
    End: buttons.at(-1),
  }[event.key]
  if (!target) return
  event.preventDefault()
  target.focus()
}

// Many parts share the width, so none keeps a minimum that could push the bar past its
// container; each activity's button is a full 24px tall over the thinner track.
const CROWDED_PARTS = 12

const trackHeights = {
  sm: { track: "h-3", hover: "after:h-3" },
  md: { track: "h-3.5", hover: "after:h-3.5" },
}

function SectionBar({
  timer,
  size,
}: {
  timer: Routine
  size: keyof typeof trackHeights
}) {
  const heights = trackHeights[size]
  const { session, act } = timer
  const live = session.phase !== "idle" && session.phase !== "finished"
  const playable = session.leaves.filter(
    (leaf) => !isCanceled(session.run, leaf.node.id)
  )
  const focusId =
    session.current && playable.includes(session.current)
      ? session.current.node.id
      : playable[0]?.node.id
  const sections =
    session.root.children.length > 0 ? session.root.children : [session.root]
  return (
    <div
      role="toolbar"
      aria-label="Go to an activity"
      onKeyDown={moveAlongBar}
      className={cn(
        "-my-1.5 flex h-6 w-full min-w-0",
        sections.length > CROWDED_PARTS ? "gap-px" : "gap-1"
      )}
    >
      {sections.map((section) => {
        const ids = new Set(nodesOf(section).map((node) => node.id))
        const leaves = session.leaves.filter((leaf) => ids.has(leaf.node.id))
        const weight = leaves.reduce((sum, leaf) => sum + leafWeight(leaf), 0)
        const isCurrent =
          live && session.current !== null && ids.has(session.current.node.id)
        return (
          <span
            key={section.id}
            title={section.title}
            style={{ flexGrow: weight }}
            className="relative flex h-full min-w-px basis-0"
          >
            <span
              aria-hidden
              style={typeStyle(
                isCurrent ? timer.typeOf(session.current?.node) : null
              )}
              className={cn(
                "absolute inset-x-0 top-1/2 flex -translate-y-1/2 overflow-hidden rounded-full bg-foreground/15",
                heights.track,
                isCurrent &&
                  (timer.typeOf(session.current?.node)
                    ? "bg-[color-mix(in_oklch,var(--swatch)_35%,var(--color-background))]"
                    : "bg-accent-text/25")
              )}
            >
              {leaves.map((leaf) => {
                // Only what's running wears a colour (its type's, else the accent); finished work
                // is plain grey.
                const running =
                  live && session.current?.node.id === leaf.node.id
                const runningType = running ? timer.typeOf(leaf.node) : null
                return (
                  <span
                    key={leaf.node.id}
                    style={{ flexGrow: leafWeight(leaf) }}
                    className="relative h-full basis-0"
                  >
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 bg-foreground/35 transition-[width] duration-200",
                        running &&
                          (runningType ? "bg-(--swatch)" : "bg-accent-text")
                      )}
                      style={{
                        ...typeStyle(timer.typeOf(leaf.node)),
                        width: `${leafProgress(leaf, session.run, session.now) * 100}%`,
                      }}
                    />
                  </span>
                )
              })}
            </span>
            {leaves.map((leaf) => (
              <button
                key={leaf.node.id}
                type="button"
                tabIndex={leaf.node.id === focusId ? 0 : -1}
                disabled={isCanceled(session.run, leaf.node.id)}
                title={jumpHint(
                  session,
                  section.id === leaf.node.id
                    ? leaf.node.title
                    : `${section.title} › ${leaf.node.title}`
                )}
                aria-label={jumpHint(session, leaf.node.title)}
                style={{ flexGrow: leafWeight(leaf) }}
                onClick={() => act({ kind: "jumpTo", id: leaf.node.id })}
                className={cn(
                  "relative h-full min-w-0 basis-0 after:absolute after:inset-x-0 after:top-1/2 after:-translate-y-1/2 first-of-type:after:rounded-l-full last-of-type:after:rounded-r-full hover:after:bg-foreground/10 disabled:cursor-not-allowed disabled:hover:after:bg-transparent",
                  heights.hover
                )}
              />
            ))}
          </span>
        )
      })}
    </div>
  )
}

function Controls({ timer }: { timer: Routine }) {
  const { session, act } = timer
  const { primary, prev, lap, next } = controlsOf(session)
  const PrimaryIcon = primaryIcons[primary.icon]
  // On a type-tinted surface the outline needs its own ground to stay legible.
  const peer = cn(
    "h-11 shrink-0 rounded-full px-5 text-sm has-data-[icon=inline-start]:pl-4 max-sm:px-4 max-sm:has-data-[icon=inline-start]:pl-3.5 [&_svg]:size-4",
    runningType(timer) && "bg-background/80"
  )
  const quiet = finishLeads(timer)
  // Three columns keep the main button on the clock's centre line whatever sits beside it.
  return (
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 max-sm:flex max-sm:flex-wrap max-sm:justify-center max-sm:gap-2">
      <div className="flex justify-end">
        {prev && stepsBack(timer) ? (
          <Button
            type="button"
            variant="outline"
            className={cn(
              "size-11 shrink-0 rounded-full p-0 [&_svg]:size-4",
              runningType(timer) && "bg-background/80"
            )}
            aria-label="Previous"
            title="Previous activity (its logged time stays)"
            disabled={prev.disabled}
            onClick={() => act(prev.action)}
          >
            <SkipBack />
          </Button>
        ) : null}
      </div>
      <Button
        type="button"
        variant={quiet ? "outline" : "default"}
        className={cn(
          quiet
            ? peer
            : "h-14 min-w-40 rounded-full px-8 text-base font-semibold has-data-[icon=inline-start]:pl-8 max-sm:min-w-32 max-sm:px-6 max-sm:has-data-[icon=inline-start]:pl-6 [&_svg]:size-5",
          // On a tinted surface the brand colour fights the type colour; neutral reads cleaner.
          runningType(timer) &&
            "bg-foreground text-background hover:bg-foreground/85"
        )}
        disabled={primary.disabled}
        onClick={() => act(primary.action)}
      >
        <PrimaryIcon
          data-icon="inline-start"
          className={filledIcon(primary.icon)}
        />
        {primary.label}
      </Button>
      <div className="flex justify-start gap-3 max-sm:gap-2">
        {lap ? (
          <Button
            type="button"
            variant="outline"
            className={peer}
            title={lap.hint}
            onClick={() => act(lap.action)}
          >
            <Flag data-icon="inline-start" />
            {lap.label}
          </Button>
        ) : null}
        {next ? (
          <Button
            type="button"
            variant="outline"
            className={peer}
            title={next.hint}
            onClick={() => act(next.action)}
          >
            <SkipForward data-icon="inline-start" />
            {next.label}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

const clockText = (timer: Routine) => {
  const node = timer.session.current?.node
  if (!node) return null
  const face = faceOf(node, timer.session.run, timer.session.now)
  return face.remaining === null
    ? clock(face.elapsed)
    : formatClock(face.remaining, "up")
}

function Clock({ timer, className }: { timer: Routine; className?: string }) {
  const text = clockText(timer)
  if (text === null) return null
  const { phase } = timer.session
  return (
    <span
      className={cn(
        "font-medium tracking-tight tabular-nums",
        isPaused(timer.session) && "text-foreground/70",
        phase !== "running" &&
          !isPaused(timer.session) &&
          "text-muted-foreground",
        className
      )}
    >
      {text}
    </span>
  )
}

function PausedLabel({
  ended,
  className,
}: {
  ended: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-warning-text",
        className
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {ended ? "Timer ended" : "Paused"}
    </span>
  )
}

// Once the timer has nothing left to say (its countdown ended, or it finished), its own
// controls step back: what's left is setting the activity's status, on its page.
const finishLeads = (timer: Routine) =>
  timerEnded(timer.session) ||
  timer.session.phase === "finished" ||
  timer.session.phase === "scopeDone"

function StartOverConfirm({
  timer,
  surface,
  className,
}: {
  timer: Routine
  surface: Surface
  className?: string
}) {
  const [asking, setAsking] = useAtom(confirmStartOverAtom)
  const titleId = useId()
  const descriptionId = useId()
  if (asking?.surface !== surface || asking.routineId !== timer.routine.id)
    return null
  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/70 px-3 py-2 text-left text-sm",
        className
      )}
    >
      <span className="flex flex-col">
        <span id={titleId} className="font-medium">
          Start {timer.routine.title} over?
        </span>
        <span id={descriptionId} className="text-xs text-muted-foreground">
          Every timer goes back to zero and the ticks clear. Time already logged
          stays on each activity.
        </span>
      </span>
      <span className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          className="max-md:h-11"
          onClick={() => setAsking(null)}
        >
          Cancel
        </Button>
        <Button
          type="button"
          autoFocus
          className="max-md:h-11"
          onClick={() => timer.act({ kind: "startOver" })}
        >
          Start over
        </Button>
      </span>
    </div>
  )
}

// What's rarely wanted and undoes work lives behind ⋯, never beside Pause.
function MoreMenu({
  timer,
  surface,
  again,
  className,
}: {
  timer: Routine
  surface: Surface
  again?: Primary["action"] | null
  className?: string
}) {
  const setAsking = useSetAtom(confirmStartOverAtom)
  const startOver = offersStartOver(timer.session)
  if (!again && !startOver) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className={cn(
              "shrink-0 text-muted-foreground max-md:size-11",
              className
            )}
            aria-label="More timer actions"
            title="More"
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {again ? (
          <DropdownMenuItem
            className="max-md:min-h-11"
            onClick={() => timer.act(again)}
          >
            <RotateCw />
            Do again
          </DropdownMenuItem>
        ) : null}
        {startOver ? (
          <DropdownMenuItem
            className="max-md:min-h-11"
            onClick={() => setAsking({ surface, routineId: timer.routine.id })}
          >
            <RotateCcw />
            Restart timer…
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ScopeLine({ timer }: { timer: Routine }) {
  const { session, act } = timer
  const { scope, phase } = session
  if (!scope || scope.id === session.root.id || phase === "finished") {
    return null
  }
  const result = actualVersusPlanned(session, scope)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        {phase === "scopeDone" ? (
          <>
            <span className="text-foreground">{scope.title}</span> finished ·{" "}
            <span className="tabular-nums">
              {clock(result.actual)}
              {result.planned ? ` of ${clock(result.planned)}` : ""}
            </span>
          </>
        ) : (
          <>
            Set to only <span className="text-foreground">{scope.title}</span>
          </>
        )}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="max-md:h-11"
        title="The timer covers the whole routine again; it keeps doing what it was doing"
        onClick={() => act({ kind: "widen" })}
      >
        Back to the whole routine
      </Button>
    </div>
  )
}

function RoutineProgress({
  timer,
  size = "md",
}: {
  timer: Routine
  size?: "sm" | "md"
}) {
  const { session } = timer
  const part = partOf(session)
  const small = size === "sm"
  const left = timeLeft(session)
  return (
    <div className={cn("flex flex-col", small ? "gap-1.5" : "gap-2")}>
      <div
        className={cn(
          "flex flex-wrap items-baseline justify-between gap-x-3 text-foreground/80 tabular-nums",
          small ? "text-sm" : "text-base"
        )}
      >
        <span className="truncate">
          {part
            ? part.title === session.current?.node.title
              ? `${part.index} of ${part.count}`
              : `${part.title} · ${part.index} of ${part.count}`
            : session.root.title}
        </span>
        <span
          title={
            left.untimed > 0
              ? `Plus ${left.untimed} untimed, which take as long as they take`
              : undefined
          }
          className={cn(
            "text-muted-foreground tabular-nums",
            small ? "text-sm" : "text-base"
          )}
        >
          {progressText(session)}
        </span>
      </div>
      <SectionBar timer={timer} size={size} />
    </div>
  )
}

function CurrentHeading({
  timer,
  size,
}: {
  timer: Routine
  size: "sm" | "xl"
}) {
  const { session } = timer
  const current = session.current
  if (!current) return null
  const big = size === "xl"
  const small = size === "sm"
  const of = stepSuffix(session)
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        small
          ? "items-start gap-0.5 text-left"
          : "items-center gap-1 text-center"
      )}
    >
      {current.parent.id === session.root.id ? null : (
        <span
          className={cn(
            "flex max-w-full min-w-0 items-center gap-1.5 text-foreground/70",
            big ? "text-xl" : "text-sm"
          )}
        >
          <span className="truncate">{current.parent.title}</span>
        </span>
      )}
      <span
        className={cn(
          "flex max-w-full min-w-0 gap-2 font-medium",
          small ? "items-start [&>span:first-child]:mt-0.5" : "items-center",
          big ? "text-4xl lg:text-5xl" : "text-base font-semibold"
        )}
      >
        {timer.typeOf(current.node) ? (
          <TypeMark
            type={timer.typeOf(current.node)}
            className={big ? "[&_svg]:size-8" : undefined}
          />
        ) : null}
        <span
          dir="auto"
          className={small ? "line-clamp-2" : "truncate pb-1 leading-tight"}
        >
          {current.node.title}
          {of ? <span className="tabular-nums">{of}</span> : null}
        </span>
      </span>
    </div>
  )
}

const RING = 46
const RING_LENGTH = 2 * Math.PI * RING

function TimerRing({
  timer,
  className,
  children,
}: {
  timer: Routine
  className?: string
  children: React.ReactNode
}) {
  const { session } = timer
  const node = session.current?.node
  if (!node) return null
  const type = timer.typeOf(node)
  const face = faceOf(node, session.run, session.now)
  const paused = isPaused(session)
  return (
    <div
      className={cn(
        "@container relative grid aspect-square place-items-center",
        className
      )}
    >
      <svg
        viewBox="0 0 100 100"
        aria-hidden
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx="50"
          cy="50"
          r={RING}
          fill="none"
          strokeWidth="4"
          className="stroke-foreground/15"
        />
        {face.fraction === null ||
        (1 - face.fraction) * RING_LENGTH < 0.5 ? null : (
          <circle
            cx="50"
            cy="50"
            r={RING}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(1 - face.fraction) * RING_LENGTH} ${RING_LENGTH}`}
            style={typeStyle(type)}
            className={cn(
              "transition-[stroke-dasharray] duration-200",
              paused
                ? type
                  ? "stroke-[color-mix(in_oklch,var(--swatch)_45%,var(--color-muted-foreground))]"
                  : "stroke-foreground/40"
                : type
                  ? "stroke-(--swatch)"
                  : "stroke-accent-text"
            )}
          />
        )}
      </svg>
      {children}
    </div>
  )
}

function UpNext({ timer }: { timer: Routine }) {
  const next = timer.session.next
  if (!next) return null
  return (
    <span className="flex max-w-full min-w-0 items-center gap-1.5 text-base text-muted-foreground">
      <span className="shrink-0">Up next</span>
      {timer.typeOf(next.node) ? (
        <TypeMark type={timer.typeOf(next.node)} />
      ) : null}
      <span dir="auto" className="truncate font-medium text-foreground">
        {next.node.title}
      </span>
      <span className="shrink-0 tabular-nums">
        {next.node.timer.mode === "down"
          ? clock(next.node.timer.seconds)
          : "stopwatch"}
      </span>
    </span>
  )
}

// One sound for the whole routine, kept on its top activity. A lone activity without a timer
// of its own plays its type's; choosing here would freeze a copy of that timer onto it.
function SoundMenu({ timer }: { timer: Routine }) {
  const setSound = useSetActivitySound(timer.workspaceId)
  const { routine } = timer
  const { data: stored } = useQuery(
    activityQuery(timer.workspaceId, routine.id)
  )
  const sound = routine.timer.sound
  const type = timer.typeOf(routine)
  const locked = routine.children.length === 0 && !stored?.activity.timer
  const choose = (next: TimerSound) => {
    previewSound(next)
    setSound.mutate(
      { id: routine.id, sound: next },
      { onError: () => toast.error("Couldn't save the sound.") }
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="shrink-0 text-muted-foreground max-md:size-11"
            aria-label={`Sound: ${timerSoundLabels[sound]}`}
            title={`Sound: ${timerSoundLabels[sound]}`}
          />
        }
      >
        {sound === "none" ? <VolumeX /> : <Volume2 />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Sound for {routine.title}
            {locked ? (
              <span className="block font-normal">
                {type
                  ? `Set by its type, ${type.name}`
                  : "Give it a countdown to choose one"}
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sound}
            onValueChange={(next) => choose(next as TimerSound)}
          >
            {TIMER_SOUNDS.map((option) => (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                disabled={locked}
                className="max-md:min-h-11"
              >
                {timerSoundLabels[option]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const stepDigitsClassName =
  "rounded-none border-b border-dotted border-foreground/40 px-1 text-right hover:border-foreground focus:rounded focus:border-transparent focus:bg-background focus:text-foreground focus:ring-2 focus:ring-ring/40"

// A step's length, typed over in its row. A stopwatch says so in a word and shows its digits
// only while typed over. Saved on Enter or leaving the field, so typing 1, 2, 0 writes once.
function TimerField({
  workspaceId,
  node,
}: {
  workspaceId: string
  node: RoutineNode
}) {
  const setTimer = useSetActivityTimer(workspaceId)
  const value =
    node.timer.mode === "down" ? secondsToValue(node.timer.seconds) : EMPTY
  const set = (next: string) =>
    setTimer.mutate(
      { id: node.id, timer: timerFrom(next, node.timer.sound) },
      { onError: () => toast.error("Couldn't save the timer.") }
    )
  if (node.timer.mode === "up") {
    return (
      <label
        title="Type a duration to make it a countdown"
        className="group inline-flex cursor-text items-baseline"
      >
        <span className="border-b border-dotted border-foreground/40 group-focus-within:hidden hover:border-foreground">
          stopwatch
        </span>
        <DurationDigits
          value={value}
          label={`${node.title} timer`}
          onCommit={set}
          className={cn(
            stepDigitsClassName,
            "w-0 min-w-0 px-0 opacity-0 group-focus-within:w-auto group-focus-within:min-w-[5ch] group-focus-within:px-1 group-focus-within:opacity-100"
          )}
        />
      </label>
    )
  }
  return (
    <span title="Type a duration over the time; 00:00 is a stopwatch">
      <DurationDigits
        value={value}
        label={`${node.title} timer`}
        onCommit={set}
        className={stepDigitsClassName}
      />
    </span>
  )
}

// Log time goes on the page's own activity, or on the whole routine away from its pages.
const logTargetOf = (timer: Routine) =>
  findNode(timer.routine, timer.session.within ?? timer.routine.id) ??
  timer.routine

const targetOf = (timer: Routine) => {
  const id = timerTargetId(timer.session)
  return {
    id,
    title:
      findNode(timer.routine, id)?.title || timer.routine.title || "Untitled",
  }
}

function DoneLine({
  timer,
  className,
}: {
  timer: Routine
  className?: string
}) {
  const summary = summaryOf(timer.session)
  const done = timer.session.run.done.includes(timerTargetId(timer.session))
  const seconds = done ? summary.recorded : summary.seconds
  return (
    <span className={cn("flex shrink-0 items-center gap-2 text-sm", className)}>
      {done ? (
        <Check className="size-4 text-primary" strokeWidth={2.5} />
      ) : null}
      <span className="font-medium">{done ? "Done" : "Timer finished"}</span>
      {seconds > 0 ? (
        <span className="text-muted-foreground tabular-nums">
          · {clock(seconds)}
        </span>
      ) : null}
    </span>
  )
}

type PageStatus = { value: ActivityStatus; names: StatusNames | null }

// The activity's Status, one of its properties. Done drops what the timer was holding and
// offers it as time to add, from what that Done actually dropped.
function StatusValue({
  workspaceId,
  activityId,
  status,
  offer,
  buttonRef,
  className,
}: {
  workspaceId: string
  activityId: string
  status: PageStatus
  offer: AddTimeOffer
  buttonRef: React.RefObject<HTMLButtonElement | null>
  className: string
}) {
  const setStatus = useSetActivityStatus(workspaceId)
  const label = statusName(status.value, status.names)
  return (
    <StatusMenu
      status={status.value}
      names={status.names}
      onChange={(next) => {
        setStatus.mutate(
          { id: activityId, status: next },
          {
            onSuccess: (dropped) => {
              // Leaving Done ends what that Done counted.
              if (next !== "done") offer.forget()
              // A Done that dropped nothing (the step had just ticked itself) offers the
              // time still waiting on it.
              if (next === "done") {
                offer.show(
                  "status",
                  dropped.length > 0 ? countedOf(dropped) : null
                )
              }
            },
            onError: () => toast.error("Couldn't change the status."),
          }
        )
      }}
      trigger={
        <button
          ref={buttonRef}
          type="button"
          aria-label={`Status: ${label}`}
          className={className}
        >
          <StatusIcon status={status.value} />
          <span className="flex-1 truncate">{label}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      }
    />
  )
}

type Reading = {
  mark: "ended" | "finished" | "done" | null
  lead: string | null
  text: string
  clock: boolean
  tone: "plain" | "live" | "quiet" | "warning" | "muted"
}

const readingMarks = {
  ended: <BellRing className="size-3.5 shrink-0 text-warning-text" />,
  finished: <Flag className="size-3.5 shrink-0 text-muted-foreground" />,
  done: <Timer className="size-3.5 shrink-0 text-muted-foreground" />,
} satisfies Record<NonNullable<Reading["mark"]>, React.ReactNode>

const readingTones = {
  plain: "text-foreground",
  live: "font-semibold text-accent-text",
  quiet: "font-medium text-muted-foreground",
  warning: "font-medium text-warning-text",
  muted: "text-muted-foreground",
} satisfies Record<Reading["tone"], string>

const readingWords = (reading: Reading) =>
  reading.lead ? `${reading.lead} ${reading.text}` : reading.text

function ReadingText({ reading }: { reading: Reading }) {
  return (
    <>
      {reading.mark ? (
        <span
          aria-hidden
          className={cn(
            "contents",
            reading.mark === "done" && "@max-[12rem]/timer:hidden"
          )}
        >
          {readingMarks[reading.mark]}
        </span>
      ) : null}
      <span className="flex min-w-0 items-baseline gap-1">
        {reading.lead ? (
          <span className={cn("truncate text-sm", readingTones[reading.tone])}>
            {reading.lead}
          </span>
        ) : null}
        <span
          className={cn(
            "text-sm whitespace-nowrap tabular-nums",
            reading.clock ? "shrink-0" : "truncate",
            readingTones[reading.tone]
          )}
        >
          {reading.text}
        </span>
      </span>
    </>
  )
}

// What the timer reads, on the left where every other property shows its value: the one
// time that matters in that state, marked only where there's nothing to play or pause.
const readingOf = (
  timer: Routine,
  state: { live: boolean; ended: boolean; done: boolean; finished: boolean }
): Reading => {
  const { session } = timer
  if (state.ended)
    return {
      mark: "ended",
      lead: null,
      text: "Ended",
      clock: false,
      tone: "warning",
    }
  if (state.live) {
    const text = clockText(timer) ?? ""
    return session.phase === "running"
      ? { mark: null, lead: null, text, clock: true, tone: "live" }
      : { mark: null, lead: null, text, clock: true, tone: "quiet" }
  }
  if (state.done) {
    const took = heldSeconds(session.run, logTargetOf(timer), session.now)
    return took > 0
      ? {
          mark: "done",
          lead: "Took",
          text: clock(took),
          clock: true,
          tone: "plain",
        }
      : {
          mark: "done",
          lead: null,
          text: "No time",
          clock: false,
          tone: "muted",
        }
  }
  if (state.finished) {
    const { seconds } = summaryOf(session)
    return {
      mark: "finished",
      lead: seconds > 0 ? "Finished ·" : null,
      text: seconds > 0 ? clock(seconds) : "Finished",
      clock: seconds > 0,
      tone: "plain",
    }
  }
  const planned = plannedSeconds(
    narrowedTo(session) ? session.scoped : session.leaves
  )
  return planned > 0
    ? {
        mark: null,
        lead: null,
        text: clock(planned),
        clock: true,
        tone: "plain",
      }
    : { mark: null, lead: null, text: "Stopwatch", clock: false, tone: "muted" }
}

const narrowedTo = (session: Routine["session"]) =>
  session.scope !== null &&
  session.scope.id !== session.root.id &&
  session.phase !== "finished"
    ? session.scope
    : null

const readingClassName =
  "flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1 max-md:h-10"

// Start, pause and resume are the round button the reading starts with: filled like the
// dock's, amber while paused, and one element throughout so focus stays on it.
const toggleLooks = {
  play: "bg-primary text-primary-foreground hover:bg-primary/85",
  pause: "bg-primary text-primary-foreground hover:bg-primary/85",
  resume:
    "border-warning-text/40 bg-warning-bg text-warning-text hover:bg-warning-text/15 hover:text-warning-text",
} as const

function PlayToggle({
  label,
  look,
  disabled,
  onClick,
}: {
  label: string
  look: keyof typeof toggleLooks
  disabled: boolean
  onClick: () => void
}) {
  const Icon = look === "pause" ? Pause : Play
  return (
    <span className="relative flex shrink-0">
      <Button
        type="button"
        variant={look === "resume" ? "outline" : "default"}
        size="icon-xs"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "relative size-5 rounded-full transition-[transform,background-color] active:scale-95 max-md:size-7 max-md:after:absolute max-md:after:-inset-2",
          toggleLooks[look]
        )}
      >
        <Icon
          className={cn(
            "size-2.5 fill-current max-md:size-3",
            look !== "pause" && "translate-x-px"
          )}
        />
      </Button>
      {look === "pause" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-0.5 rounded-full ring-2 ring-primary/30 motion-safe:animate-pulse"
        />
      ) : null}
    </span>
  )
}

// A single activity's own timer is set from its reading, with the same editor as its type's.
// Sound stays in the timer's menu, where it can change mid-run too.
function LengthReading({
  timer,
  node,
  reading,
}: {
  timer: Routine
  node: RoutineNode
  reading: Reading
}) {
  const setTimer = useSetActivityTimer(timer.workspaceId)
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Edit timer: ${reading.text}`}
            className={cn(readingClassName, "gap-1 hover:bg-accent")}
          />
        }
      >
        <ReadingText reading={reading} />
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-[calc(100vw-2rem)] p-3"
      >
        <TimerConfigEditor
          config={node.timer}
          sound={false}
          onChange={(next) =>
            setTimer.mutate(
              { id: node.id, timer: next },
              { onError: () => toast.error("Couldn't save the timer.") }
            )
          }
        />
      </PopoverContent>
    </Popover>
  )
}

const partTones = {
  running: "text-accent-text",
  paused: "text-warning-text",
  other: "text-muted-foreground",
} as const

// Playing one part on its own: the reading says so behind a click, since its name never
// fits beside the buttons.
function PartReading({
  timer,
  part,
  reading,
  tone,
}: {
  timer: Routine
  part: RoutineNode
  reading: Reading
  tone: keyof typeof partTones
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${readingWords(reading)}, only ${part.title}`}
            title={`Only ${part.title || "Untitled"}`}
            className={cn(readingClassName, "gap-1 hover:bg-accent")}
          />
        }
      >
        <ReadingText reading={reading} />
        <Focus className={cn("size-3.5 shrink-0", partTones[tone])} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-2 p-3">
        <span className="text-sm">
          Only <span className="font-medium">{part.title || "Untitled"}</span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start max-md:h-10"
          onClick={() => timer.act({ kind: "widen" })}
        >
          <ListRestart data-icon="inline-start" />
          Back to the whole routine
        </Button>
      </PopoverContent>
    </Popover>
  )
}

// The timer as a property: the play/pause button and what it reads on the left, like every
// other value; full screen, Add time and the menu pinned right.
function TimerValue({
  timer,
  status,
  offer,
  addRef,
  surface,
  className,
}: {
  timer: Routine
  status: PageStatus
  offer: AddTimeOffer
  addRef: React.RefObject<HTMLButtonElement | null>
  surface: Surface
  className?: string
}) {
  const { session, act } = timer
  const fullScreen = useFullScreen()
  const { phase, current } = session
  const { primary } = controlsOf(session)
  const live = (phase === "running" || phase === "paused") && current !== null
  const ended = live && timerEnded(session)
  const done = !live && status.value === "done"
  const finished = !live && (phase === "finished" || phase === "scopeDone")
  const idle = !live && !done && !finished
  const reading = readingOf(timer, { live, ended, done, finished })
  const part = narrowedTo(session)
  const ownLength =
    idle &&
    !part &&
    session.leaves.length === 1 &&
    current?.node.id === session.root.id
      ? current.node
      : null
  const running = live && phase === "running"
  return (
    <div
      className={cn(
        "@container/timer flex min-h-8 min-w-0 items-center gap-1",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 max-md:gap-1.5">
        {idle || (live && !ended) ? (
          <PlayToggle
            label={idle ? "Start" : primary.label}
            look={running ? "pause" : idle ? "play" : "resume"}
            disabled={primary.disabled}
            onClick={() =>
              act(idle ? { kind: part ? "play" : "playAll" } : primary.action)
            }
          />
        ) : null}
        {ownLength ? (
          <LengthReading timer={timer} node={ownLength} reading={reading} />
        ) : part && !done ? (
          <PartReading
            timer={timer}
            part={part}
            reading={reading}
            tone={running ? "running" : live ? "paused" : "other"}
          />
        ) : (
          <span className={readingClassName}>
            <ReadingText reading={reading} />
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {done ? (
          <Button
            ref={addRef}
            type="button"
            variant="outline"
            size="sm"
            className="px-1.5 max-md:h-9 max-md:px-2"
            onClick={() => offer.show("timer")}
          >
            Add time
          </Button>
        ) : null}
        {live ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground max-md:size-9 @max-[12rem]/timer:max-md:size-7"
            aria-label="Full screen"
            title="Full screen"
            onClick={() => fullScreen.enter(timer.routine.id)}
          >
            <Maximize2 />
          </Button>
        ) : null}
        <TimerMenu timer={timer} surface={surface} done={done} />
      </div>
    </div>
  )
}

// Everything but the main action, each item saying what it does. Restart asks first, over
// the page rather than pushing it down.
function TimerMenu({
  timer,
  surface,
  done,
  className,
}: {
  timer: Routine
  surface: Surface
  done: boolean
  className?: string
}) {
  const [asking, setAsking] = useAtom(confirmStartOverAtom)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const setSound = useSetActivitySound(timer.workspaceId)
  const { data: stored } = useQuery(
    activityQuery(timer.workspaceId, timer.routine.id)
  )
  const { session, routine } = timer
  const live =
    (session.phase === "running" || session.phase === "paused") &&
    session.current !== null
  // A countdown that ended can go another round; its first round stays waiting. Otherwise
  // only something done or finished plays again.
  const again = timerEnded(session)
    ? controlsOf(session).primary.action
    : !live &&
        (done || session.phase === "finished" || session.phase === "scopeDone")
      ? replayOf(session, logTargetOf(timer).id)
      : null
  const startOver = offersStartOver(session)
  const narrowed =
    session.scope !== null &&
    session.scope.id !== session.root.id &&
    session.phase !== "finished"
  const sound = routine.timer.sound
  const type = timer.typeOf(routine)
  const soundLocked = routine.children.length === 0 && !stored?.activity.timer
  const confirming =
    asking?.surface === surface && asking.routineId === routine.id
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={anchorRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn(
                "shrink-0 text-muted-foreground max-md:size-9 @max-[12rem]/timer:max-md:size-7",
                className
              )}
              aria-label="More timer actions"
              title="More timer actions"
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {again ? (
            <DropdownMenuItem
              className="max-md:min-h-11"
              onClick={() => timer.act(again)}
            >
              <RotateCw />
              Do again
            </DropdownMenuItem>
          ) : null}
          {narrowed ? (
            <DropdownMenuItem
              className="max-md:min-h-11"
              onClick={() => timer.act({ kind: "widen" })}
            >
              <ListRestart />
              Back to the whole routine
            </DropdownMenuItem>
          ) : null}
          {startOver ? (
            <DropdownMenuItem
              className="max-md:min-h-11"
              onClick={() => setAsking({ surface, routineId: routine.id })}
            >
              <RotateCcw />
              Restart timer…
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="max-md:min-h-11">
              {sound === "none" ? <VolumeX /> : <Volume2 />}
              Sound: {timerSoundLabels[sound]}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <DropdownMenuGroup>
                {soundLocked ? (
                  <DropdownMenuLabel className="font-normal">
                    {type
                      ? `Set by its type, ${type.name}`
                      : "Give it a countdown to choose one"}
                  </DropdownMenuLabel>
                ) : null}
                <DropdownMenuRadioGroup
                  value={sound}
                  onValueChange={(next) => {
                    previewSound(next as TimerSound)
                    setSound.mutate(
                      { id: routine.id, sound: next as TimerSound },
                      { onError: () => toast.error("Couldn't save the sound.") }
                    )
                  }}
                >
                  {TIMER_SOUNDS.map((option) => (
                    <DropdownMenuRadioItem
                      key={option}
                      value={option}
                      disabled={soundLocked}
                      className="max-md:min-h-11"
                    >
                      {timerSoundLabels[option]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover
        open={confirming}
        onOpenChange={(open) => {
          if (!open) setAsking(null)
        }}
      >
        <PopoverContent anchor={anchorRef} align="end" className="w-72 p-3">
          <StartOverConfirm timer={timer} surface={surface} />
        </PopoverContent>
      </Popover>
    </>
  )
}

function Dock({
  timer,
  workspaceSlug,
}: {
  timer: Routine
  workspaceSlug: string
}) {
  const { session, act } = timer
  const fullScreen = useFullScreen()
  const { current, phase } = session
  if (phase === "idle") return null
  const { primary } = controlsOf(session)
  const PrimaryIcon = primaryIcons[primary.icon]
  const live = (phase === "running" || phase === "paused") && current !== null
  const target = targetOf(timer)
  return (
    <div className="flex justify-center px-4 pt-1 pb-3 max-sm:px-2 max-sm:pb-2">
      <div className="flex max-w-xl min-w-0 items-center gap-2.5 rounded-xl border bg-popover py-1.5 pr-1.5 pl-2 shadow-lg max-sm:w-full">
        {live ? (
          <Button
            type="button"
            variant={finishLeads(timer) ? "outline" : "default"}
            size="icon-lg"
            className="shrink-0 rounded-full max-sm:size-11"
            aria-label={primary.label}
            title={primary.label}
            disabled={primary.disabled}
            onClick={() => act(primary.action)}
          >
            <PrimaryIcon className={filledIcon(primary.icon)} />
          </Button>
        ) : (
          <DoneLine timer={timer} className="pl-1" />
        )}
        {live ? <Clock timer={timer} className="text-xl leading-none" /> : null}
        <Link
          to={ACTIVITY_PATH}
          params={{ workspace: workspaceSlug, activityId: target.id }}
          title={`Go to ${target.title}`}
          className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate rounded-md px-1 py-1 text-sm hover:bg-accent max-sm:min-h-11 max-sm:items-center"
        >
          <span dir="auto" className="truncate font-medium">
            {target.title}
          </span>
          {live && current.node.id !== target.id ? (
            <span dir="auto" className="truncate text-muted-foreground">
              · {current.node.title}
            </span>
          ) : null}
        </Link>
        {live && isPaused(session) ? (
          <PausedLabel ended={timerEnded(session)} />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="shrink-0 text-muted-foreground max-sm:size-11"
          aria-label="Full screen"
          title="Full screen"
          onClick={() => fullScreen.enter(timer.routine.id)}
        >
          <Maximize2 />
        </Button>
      </div>
    </div>
  )
}

// A stopwatch has nothing to drain, so it shows its digits without a ring.
function ClockFace({ timer }: { timer: Routine }) {
  const node = timer.session.current?.node
  if (!node) return null
  if (node.timer.mode === "up") {
    return (
      <Clock
        timer={timer}
        className="text-[clamp(4.5rem,20vw,10rem)] leading-none"
      />
    )
  }
  // The digits scale with the ring (cqw), and an hour-long 1:29:59 needs a smaller face to fit.
  const long = (clockText(timer)?.length ?? 0) > 5
  return (
    <TimerRing timer={timer} className="w-[min(72vw,40vh,30rem)]">
      <div className="flex flex-col items-center gap-2">
        <Clock
          timer={timer}
          className={cn("leading-none", long ? "text-[19cqw]" : "text-[25cqw]")}
        />
        <span className="text-lg text-muted-foreground tabular-nums">
          of {clock(node.timer.seconds)}
        </span>
      </div>
    </TimerRing>
  )
}

// Back to the timer's activity. Already on it, leaving full screen steps back to the page;
// from elsewhere the link replaces the full-screen address, so Back skips it.
function ToActivity({
  timer,
  workspaceSlug,
  className,
  children,
}: {
  timer: Routine
  workspaceSlug: string
  className: string
  children: React.ReactNode
}) {
  const fullScreen = useFullScreen()
  const pageId = useParams({
    strict: false,
    select: (params) => params.activityId ?? null,
  })
  const target = targetOf(timer)
  if (pageId === target.id) {
    return (
      <button
        type="button"
        title={`Back to ${target.title}`}
        className={className}
        onClick={() => void fullScreen.exit()}
      >
        {children}
      </button>
    )
  }
  return (
    <Link
      to={ACTIVITY_PATH}
      params={{ workspace: workspaceSlug, activityId: target.id }}
      search={{}}
      replace
      title={`Go to ${target.title}`}
      className={className}
      onClick={(event) => {
        // Opened in a new tab, this tab stays in full screen.
        if (event.metaKey || event.ctrlKey || event.shiftKey) return
        fullScreen.forget()
      }}
    >
      {children}
    </Link>
  )
}

function FinishedFace({
  timer,
  workspaceSlug,
}: {
  timer: Routine
  workspaceSlug: string
}) {
  const summary = summaryOf(timer.session)
  const again = replayOf(timer.session, timerTargetId(timer.session))
  const open = !timer.session.run.done.includes(timerTargetId(timer.session))
  const seconds = open ? summary.seconds : summary.recorded
  return (
    <>
      <div className="flex flex-col items-center gap-3">
        {open ? (
          <span className="text-lg text-muted-foreground">Timer finished</span>
        ) : (
          <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Check className="size-7" strokeWidth={2.5} />
          </span>
        )}
        <span
          dir="auto"
          className="line-clamp-2 text-3xl font-semibold lg:text-4xl"
        >
          {summary.node.title || "Untitled"}
        </span>
        {seconds > 0 ? (
          <span className="text-5xl font-medium tracking-tight text-foreground/80 tabular-nums">
            {clock(seconds)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <ToActivity
          timer={timer}
          workspaceSlug={workspaceSlug}
          className={cn(
            buttonVariants(),
            "h-14 min-w-44 rounded-full px-8 text-base font-semibold"
          )}
        >
          Back to the activity
        </ToActivity>
        {again ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full px-5 text-sm has-data-[icon=inline-start]:pl-4 [&_svg]:size-4"
            onClick={() => timer.act(again)}
          >
            <RotateCw data-icon="inline-start" />
            Do again
          </Button>
        ) : null}
      </div>
    </>
  )
}

// The keys that work right now, so the hint never promises one that doesn't.
const keyHint = (controls: ReturnType<typeof controlsOf>, steps: boolean) => {
  const { primary, next, lap } = controls
  const back = steps && controls.prev !== null && !controls.prev.disabled
  const space =
    primary.icon === "pause"
      ? "Space pauses"
      : primary.icon === "again"
        ? "Space starts again"
        : primary.label === "Resume"
          ? "Space resumes"
          : "Space starts"
  return [
    primary.disabled ? null : space,
    back && next
      ? "← → move between activities"
      : back
        ? "← goes back"
        : next
          ? "→ moves on"
          : null,
    lap ? "L laps" : null,
    "Esc closes",
  ]
    .filter((part) => part !== null)
    .join(" · ")
}

const INTERACTIVE =
  "a[href], button, input, select, textarea, label, [contenteditable], [role='button'], [role='menuitem'], [role='combobox'], [role='slider']"

function RunMode({
  timer,
  workspaceSlug,
}: {
  timer: Routine
  workspaceSlug: string
}) {
  const { session, act } = timer
  const fullScreen = useFullScreen()
  const { current, phase } = session
  const controls = controlsOf(session)
  const type = runningType(timer)
  const popupRef = useRef<HTMLDivElement>(null)
  const target = targetOf(timer)
  const finished = phase === "finished" || phase === "scopeDone" || !current
  return (
    <Dialog.Root
      open
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) void fullScreen.exit()
      }}
    >
      <Dialog.Portal>
        <Dialog.Popup
          ref={popupRef}
          initialFocus={popupRef}
          aria-modal="true"
          aria-label="Full screen timer"
          onPointerUp={(event) => {
            // Clicking the background keeps the keys working; a field, button or menu keeps focus.
            const target = event.target
            if (
              target instanceof Element &&
              event.currentTarget.contains(target) &&
              !target.closest(INTERACTIVE)
            ) {
              event.currentTarget.focus()
            }
          }}
          onKeyDown={(event) => {
            // The finished screen's main action is a link; keys never start a new run there.
            if (event.target !== event.currentTarget || finished) return
            // Holding a key down would act once per repeat: Next would race down the routine.
            if (event.repeat) {
              if (event.key === " ") event.preventDefault()
              return
            }
            if (event.key === " ") {
              event.preventDefault()
              if (!controls.primary.disabled) act(controls.primary.action)
            }
            if (event.key === "ArrowRight" && controls.next)
              act(controls.next.action)
            if (
              event.key === "ArrowLeft" &&
              controls.prev &&
              !controls.prev.disabled &&
              stepsBack(timer)
            ) {
              act(controls.prev.action)
            }
            if (event.key.toLowerCase() === "l" && controls.lap) {
              act(controls.lap.action)
            }
          }}
          style={typeStyle(type)}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-background transition-colors duration-500 outline-none",
            type &&
              "bg-[color-mix(in_oklch,var(--swatch)_14%,var(--color-background))]"
          )}
        >
          <header className="flex w-full items-center justify-between gap-3 px-4 pt-3 md:px-6 md:pt-5">
            <ToActivity
              timer={timer}
              workspaceSlug={workspaceSlug}
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5 hover:text-foreground"
            >
              <ArrowLeft className="size-4 shrink-0" />
              <span dir="auto" className="truncate">
                {target.title}
              </span>
            </ToActivity>
            <span className="flex shrink-0 items-center gap-1">
              <SoundMenu timer={timer} />
              <MoreMenu timer={timer} surface="full" />
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="text-muted-foreground max-md:size-11"
                aria-label="Close full screen"
                title="Close (Esc)"
                onClick={() => void fullScreen.exit()}
              >
                <X />
              </Button>
            </span>
          </header>
          <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 pt-3 empty:hidden">
            <StartOverConfirm timer={timer} surface="full" />
            {session.scope && session.scope.id !== session.root.id ? (
              <ScopeLine timer={timer} />
            ) : null}
          </div>
          <main className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-6 overflow-y-auto px-4 pt-2 pb-8 text-center max-sm:gap-5 md:pb-10 [@media(max-height:900px)]:gap-4 [@media(max-height:900px)]:pb-4">
            {finished ? (
              <FinishedFace timer={timer} workspaceSlug={workspaceSlug} />
            ) : (
              <>
                {current.node.id === target.id ? null : (
                  <CurrentHeading timer={timer} size="xl" />
                )}
                <div className="flex flex-col items-center gap-3">
                  <ClockFace timer={timer} />
                  {isPaused(session) ? (
                    <PausedLabel
                      ended={timerEnded(session)}
                      className="text-sm"
                    />
                  ) : null}
                </div>
                <div className="flex w-full flex-col items-center gap-3">
                  {finishLeads(timer) ? (
                    <ToActivity
                      timer={timer}
                      workspaceSlug={workspaceSlug}
                      className={cn(
                        buttonVariants(),
                        "h-14 min-w-44 rounded-full px-8 text-base font-semibold"
                      )}
                    >
                      Back to the activity
                    </ToActivity>
                  ) : null}
                  <Controls timer={timer} />
                </div>
                {session.next || stepsBack(timer) ? (
                  <div className="flex w-full max-w-xl flex-col items-center gap-3">
                    <UpNext timer={timer} />
                    {stepsBack(timer) ? (
                      <div className="w-full">
                        <RoutineProgress timer={timer} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <p className="text-sm text-muted-foreground max-md:hidden">
                  {keyHint(controls, stepsBack(timer))}
                </p>
              </>
            )}
          </main>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export { Dock, RunMode, StatusValue, TimerField, TimerValue }
export type { PageStatus }
