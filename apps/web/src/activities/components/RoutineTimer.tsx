import { useId, useRef } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { useQuery } from "@tanstack/react-query"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  Check,
  Flag,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  useSetActivitySound,
  useSetActivityTimer,
} from "@/local-db/activity-mutations"
import { activityQuery } from "@/local-db/activity-queries"
import { cn } from "@/lib/utils"
import { EMPTY, secondsToValue } from "../duration"
import {
  faceOf,
  findNode,
  isCanceled,
  leafProgress,
  leafWeight,
  nodesOf,
  plannedSeconds,
  type RoutineNode,
} from "../routine"
import {
  actualVersusPlanned,
  clock,
  controlsOf,
  isLive,
  isPaused,
  jumpHint,
  offersStartOver,
  partOf,
  progressText,
  roughly,
  stepSuffix,
  summaryOf,
  timeLeft,
  type Primary,
} from "../routine-view"
import { timerFrom } from "../series"
import {
  TIMER_SOUNDS,
  formatClock,
  timerSoundLabels,
  type TimerSound,
} from "../timer"
import { previewSound } from "../timer-runner"
import {
  confirmStartOverAtom,
  useFullScreen,
  usePress,
  type Routine,
  type Surface,
} from "../use-routine"
import { swatchStyle } from "./ColorDot"
import { DurationChip, DurationDigits } from "./DurationField"
import { LogTimeButton, LogTimeForm, useLogTimeOpen } from "./LogTime"
import { TypeMark, type TimerType } from "./TypeMark"

// The running activity tints the timer with its type's colour, so a rest reads differently
// from a round at a glance without the app ever guessing from the title.
const tintClass = "bg-[color-mix(in_oklch,var(--swatch)_16%,var(--color-card))]"

const typeStyle = (type: TimerType | null) =>
  type ? swatchStyle(type.color) : undefined

const tintedType = (timer: Routine) =>
  isLive(timer.session) ? timer.typeOf(timer.session.current?.node) : null

// Paused drops the colour: a grey surface says "stopped" before any label is read.
const surfaceOf = (timer: Routine) => {
  const type = timer.session.phase === "running" ? tintedType(timer) : null
  return {
    style: typeStyle(type),
    className: type ? tintClass : isPaused(timer.session) ? "bg-muted" : null,
  }
}

const primaryIcons: Record<Primary["icon"], typeof Play> = {
  pause: Pause,
  play: Play,
  again: RotateCw,
  startOver: RotateCcw,
}

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
                "absolute inset-x-0 top-1/2 flex -translate-y-1/2 overflow-hidden rounded-full bg-foreground/20",
                heights.track,
                isCurrent &&
                  timer.typeOf(session.current?.node) &&
                  "bg-[color-mix(in_oklch,var(--swatch)_75%,var(--color-background))]"
              )}
            >
              {leaves.map((leaf) => {
                // Only what's running wears its type's colour; finished work is plain grey.
                const running =
                  live && session.current?.node.id === leaf.node.id
                return (
                  <span
                    key={leaf.node.id}
                    style={{ flexGrow: leafWeight(leaf) }}
                    className="relative h-full basis-0"
                  >
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 bg-foreground/70 transition-[width] duration-200",
                        running && "bg-transparent"
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

function Controls({
  timer,
  size,
  surface,
}: {
  timer: Routine
  size: "sm" | "xl"
  surface: Surface
}) {
  const { session, act } = timer
  const press = usePress(timer, surface)
  const big = size === "xl"
  const { primary, prev, lap, next } = controlsOf(session)
  const PrimaryIcon = primaryIcons[primary.icon]
  const peer = cn(
    "shrink-0 rounded-full bg-background",
    big
      ? "h-14 px-6 text-base max-sm:h-12 max-sm:px-4 [&_svg]:size-5"
      : "h-11 px-3.5 text-sm [&_svg]:size-4"
  )
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center",
        big ? "gap-3 max-sm:gap-2" : "gap-1.5"
      )}
    >
      {prev ? (
        <Button
          type="button"
          variant="outline"
          className={cn(
            "shrink-0 rounded-full bg-background p-0 text-foreground disabled:border-transparent disabled:bg-transparent",
            big
              ? "size-14 max-sm:size-12 [&_svg]:size-5"
              : "size-11 [&_svg]:size-4"
          )}
          aria-label="Previous"
          title="Previous activity (its logged time stays)"
          disabled={prev.disabled}
          onClick={() => act(prev.action)}
        >
          <SkipBack />
        </Button>
      ) : null}
      <Button
        type="button"
        className={cn(
          "rounded-full font-semibold",
          big
            ? "h-16 min-w-44 px-9 text-lg max-sm:h-14 max-sm:min-w-0 max-sm:flex-1 max-sm:px-6 [&_svg]:size-7"
            : "h-11 min-w-0 flex-1 text-sm font-semibold [&_svg]:size-4",
          // On a tinted surface the brand colour fights the type colour; neutral reads cleaner.
          tintedType(timer) &&
            "bg-foreground text-background hover:bg-foreground/85"
        )}
        disabled={primary.disabled}
        onClick={() => press(primary.action)}
      >
        <PrimaryIcon data-icon="inline-start" />
        {primary.label}
      </Button>
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
          {next.skip ? (
            <SkipForward data-icon="inline-start" />
          ) : (
            <Check data-icon="inline-start" />
          )}
          {next.label}
        </Button>
      ) : null}
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
  if (asking !== surface) return null
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

// Kept quiet under the progress, away from Pause and Done, so it is findable but never hit by mistake.
function StartOver({
  timer,
  size,
  surface,
}: {
  timer: Routine
  size: "sm" | "lg"
  surface: Surface
}) {
  const setAsking = useSetAtom(confirmStartOverAtom)
  if (!offersStartOver(timer.session)) return null
  return (
    <Button
      type="button"
      variant="ghost"
      size={size === "lg" ? "default" : "sm"}
      className={cn(
        "self-center text-foreground/70 max-md:h-11",
        size === "lg" && "text-base"
      )}
      onClick={() => setAsking(surface)}
    >
      <RotateCcw />
      Start over
    </Button>
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
            ? `${part.title} · ${part.index} of ${part.count}`
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
        <TypeMark
          type={timer.typeOf(current.node)}
          className={big ? "[&_svg]:size-8" : undefined}
        />
        <span dir="auto" className={small ? "line-clamp-2" : "truncate"}>
          {current.node.title}
          {of ? <span className="tabular-nums">{of}</span> : null}
        </span>
      </span>
    </div>
  )
}

const RING = 46
const RING_LENGTH = 2 * Math.PI * RING

// A stopwatch has nothing to drain, so it shows the track alone.
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
        {face.fraction === null ? null : (
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

function ClockLine({ timer, size }: { timer: Routine; size: "sm" | "xl" }) {
  const node = timer.session.current?.node
  if (!node) return null
  const big = size === "xl"
  const paused = isPaused(timer.session)
  // The digits scale with the ring (cqw), and an hour-long 1:29:59 needs a smaller face to fit.
  const long = (clockText(timer)?.length ?? 0) > 5
  return (
    <div className="relative flex flex-col items-center gap-1.5">
      <Clock
        timer={timer}
        className={cn("leading-none", long ? "text-[19cqw]" : "text-[27cqw]")}
      />
      <span
        className={cn(
          "text-foreground/85",
          big ? "text-lg font-medium" : "text-sm"
        )}
      >
        {node.timer.mode === "down"
          ? `of ${clock(node.timer.seconds)}`
          : "stopwatch, counting up"}
      </span>
      {/* Floats clear of the digits so pausing never moves them, and the target stays in view. */}
      {paused ? (
        <span
          className={cn(
            "absolute rounded-full bg-foreground font-semibold tracking-widest text-background uppercase",
            big
              ? "top-full mt-3 px-4 py-1.5 text-base"
              : "bottom-full mb-1.5 px-2.5 py-0.5 text-xs"
          )}
        >
          Paused
        </span>
      ) : null}
    </div>
  )
}

function UpNext({
  timer,
  size,
  className,
}: {
  timer: Routine
  size: "sm" | "lg"
  className?: string
}) {
  const { session } = timer
  const next = session.next
  const small = size === "sm"
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2 bg-foreground/5 text-foreground/80",
        small
          ? "rounded-lg px-3 py-2 text-sm"
          : "rounded-full px-6 py-3 text-2xl max-sm:px-5 max-sm:text-xl",
        className
      )}
    >
      {next ? (
        <>
          <span
            className={cn("shrink-0 text-foreground/70", !small && "text-lg")}
          >
            Up next
          </span>
          <TypeMark type={timer.typeOf(next.node)} />
          <span dir="auto" className="truncate font-semibold text-foreground">
            {next.node.title}
          </span>
          <span className="shrink-0 font-medium text-foreground tabular-nums">
            {next.node.timer.mode === "down"
              ? clock(next.node.timer.seconds)
              : "counts up"}
          </span>
        </>
      ) : (
        <span>Last one{session.scope ? ` in ${session.scope.title}` : ""}</span>
      )}
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
            size="icon-sm"
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

// Saved on Enter or leaving the field, so typing 1, 2, 0 writes once, not three times.
function TimerField({
  workspaceId,
  node,
  variant,
}: {
  workspaceId: string
  node: RoutineNode
  variant: "chip" | "row"
}) {
  const setTimer = useSetActivityTimer(workspaceId)
  const value =
    node.timer.mode === "down" ? secondsToValue(node.timer.seconds) : EMPTY
  const set = (next: string) =>
    setTimer.mutate(
      { id: node.id, timer: timerFrom(next, node.timer.sound) },
      { onError: () => toast.error("Couldn't save the timer.") }
    )
  if (variant === "chip") {
    return (
      <DurationChip
        value={value}
        label={`${node.title} timer`}
        zeroLabel="stopwatch"
        downLabel="countdown"
        className="mt-1 self-start"
        onCommit={set}
      />
    )
  }
  return (
    <span
      title="Type a duration over the time; 00:00 is a stopwatch"
      className="inline-flex items-baseline gap-1"
    >
      {node.timer.mode === "up" ? <span>stopwatch</span> : null}
      <DurationDigits
        value={value}
        label={`${node.title} timer`}
        onCommit={set}
        className="rounded px-1 text-right decoration-dotted underline-offset-4 hover:underline focus:bg-accent focus:text-foreground"
      />
    </span>
  )
}

// Log time goes on the page's own activity, or on the whole routine away from its pages.
const logTargetOf = (timer: Routine) =>
  findNode(timer.routine, timer.session.within ?? timer.routine.id) ??
  timer.routine

// Time is logged for work still to do; a done activity or a finished routine has its time.
const offersLogTime = (timer: Routine) => {
  const { phase, run } = timer.session
  const page = logTargetOf(timer)
  return (
    phase !== "running" &&
    phase !== "finished" &&
    !run.done.includes(page.id) &&
    !run.canceled.includes(page.id)
  )
}

function SideActions({
  timer,
  surface,
  size,
  timezone,
}: {
  timer: Routine
  surface: Surface
  size: "sm" | "lg"
  timezone: string
}) {
  const page = logTargetOf(timer)
  const logTime = useLogTimeOpen(page.id, surface)
  const asking = useAtomValue(confirmStartOverAtom) === surface
  if (logTime.open) {
    return <LogTimeForm timer={timer} node={page} timezone={timezone} />
  }
  if (asking) {
    return (
      <StartOverConfirm timer={timer} surface={surface} className="w-full" />
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {offersLogTime(timer) ? <LogTimeButton onClick={logTime.show} /> : null}
      <StartOver timer={timer} size={size} surface={surface} />
    </div>
  )
}

function Summary({ timer, size }: { timer: Routine; size: "sm" | "xl" }) {
  const summary = summaryOf(timer.session)
  const done =
    summary.complete || timer.session.run.done.includes(summary.node.id)
  const big = size === "xl"
  return (
    <span
      className={cn(
        "flex min-w-0 flex-col",
        big ? "items-center gap-1 text-center" : "items-start gap-0.5"
      )}
    >
      {done ? (
        <span className={cn("text-foreground/70", big ? "text-xl" : "text-sm")}>
          Done
        </span>
      ) : null}
      <span
        dir="auto"
        className={cn(
          "line-clamp-2 font-semibold",
          big ? "text-4xl lg:text-5xl" : "text-base"
        )}
      >
        {summary.node.title}
      </span>
      <span
        className={cn(
          "font-medium tracking-tight tabular-nums",
          big ? "mt-4 text-7xl" : "mt-1 text-3xl"
        )}
      >
        {clock(summary.seconds)}
      </span>
    </span>
  )
}

// In the sticky sidebar on desktop and under the title on a phone. Full screen is the view
// to work from; this keeps the run in reach while you read.
function TimerPanel({ timer, timezone }: { timer: Routine; timezone: string }) {
  const { session, act } = timer
  const fullScreen = useFullScreen()
  const { phase, current } = session
  const page = logTargetOf(timer)
  const logTime = useLogTimeOpen(page.id, "panel")

  const pageDone = session.run.done.includes(page.id)
  if (phase === "idle" && !pageDone) {
    const only =
      session.scope && session.scope.id !== session.root.id
        ? session.scope
        : null
    const leaves = only ? session.scoped : session.leaves
    const planned = plannedSeconds(leaves)
    const ownTimer = leaves.length === 1 && current?.node.id === session.root.id
    const startable = !controlsOf(session).primary.disabled
    return (
      <section
        aria-label="Timer"
        className="-mx-3 flex flex-col gap-3 rounded-xl bg-muted/40 p-3 max-lg:mx-0 max-lg:border"
      >
        <div className="flex items-start justify-between gap-2">
          {ownTimer ? (
            <TimerField
              workspaceId={timer.workspaceId}
              node={current.node}
              variant="chip"
            />
          ) : (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm text-foreground/70">
                {only ? `Only ${only.title} · starts with` : "Starts with"}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-base font-semibold">
                {current && timer.typeOf(current.node) ? (
                  <TypeMark type={timer.typeOf(current.node)} />
                ) : null}
                <span dir="auto" className="truncate">
                  {current?.node.title}
                </span>
              </span>
              {planned > 0 ? (
                <span className="text-sm text-foreground/70">
                  About {roughly(planned)}
                </span>
              ) : null}
            </div>
          )}
          <SoundMenu timer={timer} />
        </div>
        {logTime.open ? (
          <LogTimeForm timer={timer} node={page} timezone={timezone} />
        ) : (
          <div className="flex gap-2">
            <Button
              type="button"
              className="h-11 min-w-0 flex-1 rounded-full bg-foreground text-sm font-semibold text-background hover:bg-foreground/85 [&_svg]:size-4"
              aria-label={`Start ${only?.title ?? session.root.title}`}
              title={startable ? undefined : "Every activity in it is canceled"}
              disabled={!startable}
              onClick={() => act({ kind: only ? "play" : "playAll" })}
            >
              <Play data-icon="inline-start" />
              Start
            </Button>
            <LogTimeButton onClick={logTime.show} />
          </div>
        )}
        <ScopeLine timer={timer} />
      </section>
    )
  }

  const surface = surfaceOf(timer)
  return (
    <section
      aria-label="Timer"
      style={surface.style}
      className={cn(
        "-mx-3 flex flex-col gap-3 rounded-xl bg-muted/40 p-3 transition-colors duration-500 max-lg:mx-0 max-lg:border",
        surface.className
      )}
    >
      {phase === "finished" || phase === "idle" || !current ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <Summary timer={timer} size="sm" />
            <SoundMenu timer={timer} />
          </div>
          {phase === "idle" ? (
            <Button
              type="button"
              className="h-11 rounded-full bg-foreground text-sm font-semibold text-background hover:bg-foreground/85 [&_svg]:size-4"
              onClick={() => act({ kind: "playAll" })}
            >
              <RotateCw data-icon="inline-start" />
              Do again
            </Button>
          ) : (
            <Controls timer={timer} size="sm" surface="panel" />
          )}
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <CurrentHeading timer={timer} size="sm" />
            <span className="flex shrink-0 items-center gap-1">
              <SoundMenu timer={timer} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 bg-background px-2.5 text-xs font-medium max-md:h-11 [&_svg]:size-3.5"
                title="Full screen"
                onClick={() => fullScreen.enter(timer.routine.id)}
              >
                <Maximize2 data-icon="inline-start" />
                Full screen
              </Button>
            </span>
          </div>
          <ScopeLine timer={timer} />
          <TimerRing timer={timer} className="mx-auto w-52">
            <ClockLine timer={timer} size="sm" />
          </TimerRing>
          <Controls timer={timer} size="sm" surface="panel" />
          <UpNext timer={timer} size="sm" />
        </>
      )}
      {phase === "finished" || phase === "idle" ? null : (
        <RoutineProgress timer={timer} size="sm" />
      )}
      <SideActions
        timer={timer}
        surface="panel"
        size="sm"
        timezone={timezone}
      />
    </section>
  )
}

function Dock({ timer, timezone }: { timer: Routine; timezone: string }) {
  const { session, act } = timer
  const fullScreen = useFullScreen()
  const press = usePress(timer, "dock")
  const page = logTargetOf(timer)
  const logTime = useLogTimeOpen(page.id, "dock")
  const { current, phase } = session
  if (phase === "idle") return null
  const { primary, lap, next } = controlsOf(session)
  const PrimaryIcon = primaryIcons[primary.icon]
  const summary = phase === "finished" || !current
  const total = summaryOf(session)
  const surface = surfaceOf(timer)
  return (
    <div className="flex justify-center px-4 pt-1 pb-3 max-sm:px-2 max-sm:pb-2">
      <div
        style={surface.style}
        className={cn(
          "flex w-full max-w-2xl flex-col gap-2 rounded-2xl border bg-popover p-3 shadow-xl max-sm:p-2",
          surface.className
        )}
      >
        <StartOverConfirm timer={timer} surface="dock" />
        {logTime.open ? (
          <LogTimeForm timer={timer} node={page} timezone={timezone} />
        ) : null}
        <div className="flex items-center gap-2 max-sm:gap-1.5">
          <button
            type="button"
            onClick={() => fullScreen.enter(timer.routine.id)}
            aria-label={`Full screen: ${summary ? total.node.title : current.node.title}`}
            title="Full screen"
            className="flex min-h-11 min-w-0 flex-1 items-center gap-4 rounded-xl px-2 py-1 text-left hover:bg-foreground/5 max-sm:gap-2.5 max-sm:px-1"
          >
            {summary ? (
              <>
                <span className="text-4xl leading-none font-medium tracking-tight text-muted-foreground tabular-nums max-sm:text-3xl">
                  {clock(total.seconds)}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-lg font-medium max-sm:text-base">
                    {total.node.title}
                  </span>
                  <span className="truncate text-sm text-foreground/85">
                    {total.complete ? "Complete" : "Nothing left to play"}
                  </span>
                </span>
              </>
            ) : (
              <>
                <Clock
                  timer={timer}
                  className="text-4xl leading-none max-sm:text-3xl"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-lg max-sm:text-base">
                    <TypeMark type={timer.typeOf(current.node)} />
                    <span className="truncate font-medium">
                      {current.node.title}
                    </span>
                  </span>
                  <span className="truncate text-sm text-foreground/85">
                    {isPaused(session) ? "Paused · " : ""}
                    {current.parent.id === session.root.id ? (
                      session.root.title
                    ) : (
                      <>
                        {current.parent.title}
                        <span className="max-sm:hidden">
                          {" "}
                          · {session.root.title}
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </>
            )}
          </button>

          <Button
            type="button"
            className={cn(
              "h-12 rounded-full px-4 font-semibold max-sm:size-11 max-sm:px-0 [&_svg]:size-5",
              tintedType(timer) &&
                "bg-foreground text-background hover:bg-foreground/85"
            )}
            aria-label={primary.label}
            disabled={primary.disabled}
            onClick={() => press(primary.action)}
          >
            <PrimaryIcon data-icon="inline-start" />
            <span className="max-sm:sr-only">{primary.label}</span>
          </Button>
          {lap ? (
            <Button
              type="button"
              variant="ghost"
              className="size-11"
              aria-label={lap.label}
              title={lap.hint}
              onClick={() => act(lap.action)}
            >
              <Flag />
            </Button>
          ) : null}
          {next ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 bg-background px-3 max-sm:size-11 max-sm:rounded-full max-sm:px-0"
              aria-label={next.label}
              title={next.hint}
              onClick={() => act(next.action)}
            >
              {next.skip ? (
                <SkipForward data-icon="inline-start" />
              ) : (
                <Check data-icon="inline-start" />
              )}
              <span className="max-sm:sr-only">{next.label}</span>
            </Button>
          ) : null}
          {offersLogTime(timer) && !logTime.open ? (
            <LogTimeButton compact onClick={logTime.show} />
          ) : null}
          <span aria-hidden className="mx-1 h-8 w-px bg-border max-sm:hidden" />
          <Button
            type="button"
            variant="outline"
            className="h-11 bg-background px-3 max-sm:size-11 max-sm:px-0"
            aria-label="Full screen"
            title="Full screen"
            onClick={() => fullScreen.enter(timer.routine.id)}
          >
            <Maximize2 data-icon="inline-start" />
            <span className="max-sm:sr-only">Full screen</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

const INTERACTIVE =
  "a[href], button, input, select, textarea, label, [contenteditable], [role='button'], [role='menuitem'], [role='combobox'], [role='slider']"

function RunMode({
  timer,
  backTo,
  timezone,
}: {
  timer: Routine
  backTo: string
  timezone: string
}) {
  const { session, act } = timer
  const fullScreen = useFullScreen()
  const press = usePress(timer, "full")
  const { current, phase } = session
  const controls = controlsOf(session)
  const surface = surfaceOf(timer)
  const popupRef = useRef<HTMLDivElement>(null)
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
            if (event.target !== event.currentTarget) return
            // Holding a key down would act once per repeat: Next would race down the routine.
            if (event.repeat) {
              if (event.key === " ") event.preventDefault()
              return
            }
            if (event.key === " ") {
              event.preventDefault()
              if (!controls.primary.disabled) press(controls.primary.action)
            }
            if (event.key === "ArrowRight" && controls.next)
              act(controls.next.action)
            if (
              event.key === "ArrowLeft" &&
              controls.prev &&
              !controls.prev.disabled
            ) {
              act(controls.prev.action)
            }
            if (event.key.toLowerCase() === "l" && controls.lap) {
              act(controls.lap.action)
            }
          }}
          style={surface.style}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-background transition-colors duration-500 outline-none",
            surface.className === tintClass
              ? "bg-[color-mix(in_oklch,var(--swatch)_18%,var(--color-background))]"
              : surface.className
          )}
        >
          <header className="flex w-full justify-end px-4 pt-3 md:px-6 md:pt-6">
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 bg-background px-4 text-sm font-medium shadow-xs max-md:h-11 [&_svg]:size-4"
              onClick={() => void fullScreen.exit()}
              title="Back to the page (Esc)"
            >
              <Minimize2 data-icon="inline-start" />
              Back to {backTo}
            </Button>
          </header>
          {session.scope && session.scope.id !== session.root.id ? (
            <div className="px-4 pt-3 md:px-8">
              <ScopeLine timer={timer} />
            </div>
          ) : null}
          <main className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-5 overflow-y-auto px-4 pt-2 pb-8 text-center max-sm:gap-4 md:pb-10">
            {phase === "finished" || !current ? (
              <>
                <Summary timer={timer} size="xl" />
                <Controls timer={timer} size="xl" surface="full" />
                <div className="w-full max-w-xl">
                  <SideActions
                    timer={timer}
                    surface="full"
                    size="lg"
                    timezone={timezone}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="max-sm:mt-auto">
                  <CurrentHeading timer={timer} size="xl" />
                </div>
                <TimerRing timer={timer} className="w-[min(72vw,48vh,36rem)]">
                  <ClockLine timer={timer} size="xl" />
                </TimerRing>
                <div className="w-full max-sm:order-last max-sm:mt-auto max-sm:pb-2">
                  <Controls timer={timer} size="xl" surface="full" />
                </div>
                <UpNext timer={timer} size="lg" className="justify-center" />
                <div className="flex w-full max-w-xl flex-col gap-3">
                  <RoutineProgress timer={timer} />
                  <SideActions
                    timer={timer}
                    surface="full"
                    size="lg"
                    timezone={timezone}
                  />
                </div>
                <p className="text-sm text-foreground/60 max-md:hidden">
                  Space pauses · ← → move between activities · Esc goes back
                </p>
              </>
            )}
          </main>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export { Dock, RunMode, SideActions, TimerField, TimerPanel }
