import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { Flag, Pause, Play, RotateCcw, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { TimerConfigEditor } from "@/activities/components/TimerConfigEditor"
import {
  elapsedSeconds,
  formatClock,
  lapsAllowed,
  resolveTimer,
  runningEntry,
  timerLaps,
  timerModeLabels,
  timerState,
  timerTotalSeconds,
  type TimeEntry,
  type TimerConfig,
  type TimerLap,
} from "@/activities/timer"
import { clockAtom } from "@/activities/timer-clock"
import { armTimer, disarmTimer } from "@/activities/timer-runner"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  useClearTimer,
  useLapTimer,
  useRestoreTimeEntries,
  useSetActivityTimer,
  useStartTimer,
  useStopTimer,
} from "@/local-db/activity-mutations"
import { timeEntriesQuery } from "@/local-db/activity-queries"
import type { ActivityRow } from "@/local-db/db"
import { cn } from "@/lib/utils"
import { useActivityType } from "./ActivityTypeFields"

type Workspace = { id: string }

function TimerFace({
  config,
  elapsed,
}: {
  config: TimerConfig
  elapsed: number
}) {
  const state = timerState(config, elapsed)
  const clock = (() => {
    switch (state.kind) {
      case "stopwatch":
        return {
          caption: "Elapsed",
          time: formatClock(state.elapsed, "down"),
        }
      case "countdown":
        return {
          caption: state.finished
            ? "Done"
            : `Countdown of ${formatClock(state.total, "down")}`,
          time: formatClock(state.remaining, "up"),
        }
      case "work":
      case "rest":
        return {
          caption: `Round ${state.round} of ${state.rounds} · ${state.kind === "work" ? "Work" : "Rest"}`,
          time: formatClock(state.remaining, "up"),
        }
      case "finished":
        return {
          caption: `Done · ${state.rounds === 1 ? "1 round" : `${state.rounds} rounds`}`,
          time: "0:00",
        }
    }
  })()

  return (
    <div className="flex flex-col gap-0.5">
      <span
        aria-live="polite"
        className={cn(
          "text-xs text-muted-foreground",
          state.kind === "rest" && "text-accent-text"
        )}
      >
        {clock.caption}
      </span>
      <span className="text-3xl font-medium tracking-tight tabular-nums">
        {clock.time}
      </span>
      {state.kind === "stopwatch" ? null : (
        <span className="text-xs text-muted-foreground tabular-nums">
          Logged {formatClock(elapsed, "down")}
        </span>
      )}
    </div>
  )
}

function RunningFace({
  config,
  entries,
}: {
  config: TimerConfig
  entries: TimeEntry[]
}) {
  const at = useAtomValue(clockAtom)
  return <TimerFace config={config} elapsed={elapsedSeconds(entries, at)} />
}

function LapList({ laps }: { laps: TimerLap[] }) {
  if (laps.length === 0) return null
  return (
    <div className="flex flex-col border-t px-2 pt-2 text-sm tabular-nums">
      <div
        aria-hidden
        className="flex items-center gap-3 pb-1 text-xs text-muted-foreground"
      >
        <span>Lap</span>
        <span className="ml-auto">Time</span>
        <span className="w-16 text-right">Total</span>
      </div>
      <ol
        aria-label="Laps"
        aria-live="polite"
        className="flex max-h-48 flex-col overflow-y-auto"
      >
        {laps
          .slice()
          .reverse()
          .map((lap) => (
            <li key={lap.number} className="flex min-h-7 items-center gap-3">
              <span className="text-muted-foreground">Lap {lap.number}</span>
              <span className="ml-auto">
                <span className="sr-only">lap time </span>
                {formatClock(lap.seconds, "down")}
              </span>
              <span className="w-16 text-right text-muted-foreground">
                <span className="sr-only">, total </span>
                {formatClock(lap.total, "down")}
              </span>
            </li>
          ))}
      </ol>
    </div>
  )
}

// After a reload nothing stops a countdown that ran out, so Lap hides once the clock passes the end.
function LapButton({
  config,
  entries,
  onLap,
}: {
  config: TimerConfig
  entries: TimeEntry[]
  onLap: () => void
}) {
  const at = useAtomValue(clockAtom)
  const total = timerTotalSeconds(config)
  if (total !== null && elapsedSeconds(entries, at) >= total) return null
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className="max-md:size-11"
      aria-label="Lap"
      title="Lap"
      onClick={onLap}
    >
      <Flag />
    </Button>
  )
}

function TimerSettings({
  activity,
  config,
  typeName,
  workspace,
  disabled,
}: {
  activity: ActivityRow
  config: TimerConfig
  typeName: string | null
  workspace: Workspace
  disabled: boolean
}) {
  const setTimer = useSetActivityTimer(workspace.id)
  const save = (timer: TimerConfig | null) =>
    setTimer.mutate(
      { id: activity.id, timer },
      { onError: () => toast.error("Couldn't save the timer settings.") }
    )

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-md:size-11"
            aria-label="Timer settings"
            title={disabled ? "Pause to change the timer" : "Timer settings"}
            disabled={disabled}
          />
        }
      >
        <SlidersHorizontal />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-4 p-4">
        <TimerConfigEditor config={config} onChange={save} />
        <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span>
            {activity.timer === null
              ? typeName
                ? `From the ${typeName} type`
                : "Default timer"
              : "Set for this activity"}
          </span>
          {activity.timer === null ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => save(null)}
            >
              {typeName ? `Use ${typeName} timer` : "Use default"}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ActivityTimer({
  activity,
  workspace,
  className,
}: {
  activity: ActivityRow
  workspace: Workspace
  className?: string
}) {
  const { type } = useActivityType(activity, workspace.id)
  const { data: entries = [], isSuccess: entriesLoaded } = useQuery(
    timeEntriesQuery(workspace.id, activity.id)
  )
  const startTimer = useStartTimer(workspace.id)
  const stopTimer = useStopTimer(workspace.id)
  const lapTimer = useLapTimer(workspace.id)
  const clearTimer = useClearTimer(workspace.id)
  const restoreEntries = useRestoreTimeEntries(workspace.id)
  const config = resolveTimer(activity.timer, type?.timer ?? null)
  const running = runningEntry(entries)
  const total = timerTotalSeconds(config)
  const stoppedElapsed = elapsedSeconds(entries, null)
  const finished = total !== null && stoppedElapsed >= total

  const stop = () => {
    disarmTimer(activity.id)
    stopTimer.mutate(
      { activityId: activity.id, timer: config, finished: false },
      { onError: () => toast.error("Couldn't stop the timer.") }
    )
  }

  // Armed inside the click so the browser lets the sounds play.
  const start = () => {
    armTimer({
      activityId: activity.id,
      config,
      elapsed: stoppedElapsed,
      onFinish: () =>
        stopTimer.mutate({
          activityId: activity.id,
          timer: config,
          finished: true,
        }),
    })
    startTimer.mutate(activity.id, {
      onError: () => {
        disarmTimer(activity.id)
        toast.error("Couldn't start the timer.")
      },
    })
  }

  const lap = () =>
    lapTimer.mutate(
      { activityId: activity.id, timer: config },
      { onError: () => toast.error("Couldn't record the lap.") }
    )

  const reset = () =>
    clearTimer.mutate(activity.id, {
      onSuccess: (rows) => {
        if (rows.length === 0) return
        toast("Timer reset", {
          action: { label: "Undo", onClick: () => restoreEntries.mutate(rows) },
        })
      },
    })

  return (
    <section
      aria-label="Timer"
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex items-center justify-between gap-2 px-2">
        <span className="text-xs text-muted-foreground">
          {timerModeLabels[config.mode]}
        </span>
        <TimerSettings
          activity={activity}
          config={config}
          typeName={type?.name ?? null}
          workspace={workspace}
          disabled={running !== null}
        />
      </div>
      <div className="flex items-end justify-between gap-3 px-2">
        {running ? (
          <RunningFace config={config} entries={entries} />
        ) : (
          <TimerFace config={config} elapsed={stoppedElapsed} />
        )}
        <div className="flex items-center gap-1">
          {running && lapsAllowed(config) ? (
            <LapButton config={config} entries={entries} onLap={lap} />
          ) : null}
          {running ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="max-md:size-11"
              aria-label="Reset timer"
              title="Reset timer"
              disabled={entries.length === 0}
              onClick={reset}
            >
              <RotateCcw />
            </Button>
          )}
          {running ? (
            <Button
              type="button"
              size="icon-lg"
              className="max-md:size-11"
              aria-label="Pause timer"
              onClick={stop}
            >
              <Pause />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon-lg"
              className="max-md:size-11"
              aria-label={stoppedElapsed > 0 ? "Resume timer" : "Start timer"}
              disabled={!entriesLoaded || finished}
              onClick={start}
            >
              <Play />
            </Button>
          )}
        </div>
      </div>
      <LapList laps={timerLaps(entries)} />
    </section>
  )
}

export { ActivityTimer }
