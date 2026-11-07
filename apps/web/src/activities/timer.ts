import { z } from "zod"
import {
  addSeconds,
  secondsBetween,
  type UtcDatetime,
} from "@knight-os/server/core"

const TIMER_MODES = ["stopwatch", "countdown", "intervals"] as const

const TIMER_SOUNDS = ["none", "bell", "beep", "chime"] as const

const MAX_TIMER_SECONDS = 24 * 60 * 60

const timerSeconds = z.number().int().min(1).max(MAX_TIMER_SECONDS)

const timerSound = z.enum(TIMER_SOUNDS)

const timerConfigSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("stopwatch"), sound: timerSound }),
  z.object({
    mode: z.literal("countdown"),
    seconds: timerSeconds,
    sound: timerSound,
  }),
  z.object({
    mode: z.literal("intervals"),
    workSeconds: timerSeconds,
    restSeconds: z.number().int().min(0).max(MAX_TIMER_SECONDS),
    rounds: z.number().int().min(1).max(100),
    sound: timerSound,
  }),
])

type TimerConfig = z.infer<typeof timerConfigSchema>

type TimerMode = TimerConfig["mode"]

type TimerSound = z.infer<typeof timerSound>

type TimerCue = "work" | "rest" | "finish"

type TimeEntry = {
  startedAt: UtcDatetime
  endedAt: UtcDatetime | null
}

const DEFAULT_TIMER: TimerConfig = { mode: "stopwatch", sound: "none" }

const timerModeLabels: Record<TimerMode, string> = {
  stopwatch: "Stopwatch",
  countdown: "Countdown",
  intervals: "Intervals",
}

const timerSoundLabels: Record<TimerSound, string> = {
  none: "No sound",
  bell: "Bell",
  beep: "Beep",
  chime: "Chime",
}

class InvalidTimerError extends Error {}

// The whole run is capped too, since browsers fire timeouts longer than ~24.8 days at once.
const parseTimerConfig = (config: unknown): TimerConfig => {
  const parsed = timerConfigSchema.safeParse(config)
  if (!parsed.success) throw new InvalidTimerError("Invalid timer settings.")
  if ((timerTotalSeconds(parsed.data) ?? 0) > MAX_TIMER_SECONDS) {
    throw new InvalidTimerError("A timer can run for at most 24 hours.")
  }
  return parsed.data
}

// The activity's own settings win; without them it uses its type's, then a silent stopwatch.
const resolveTimer = (
  activityTimer: TimerConfig | null,
  typeTimer: TimerConfig | null
) => activityTimer ?? typeTimer ?? DEFAULT_TIMER

// Switching mode keeps the sound and fills the new mode's durations with sensible starts.
const withMode = (config: TimerConfig, mode: TimerMode): TimerConfig => {
  if (config.mode === mode) return config
  switch (mode) {
    case "stopwatch":
      return { mode, sound: config.sound }
    case "countdown":
      return { mode, seconds: 10 * 60, sound: config.sound }
    case "intervals":
      return {
        mode,
        workSeconds: 3 * 60,
        restSeconds: 60,
        rounds: 3,
        sound: config.sound,
      }
  }
}

// The last round has no rest after it.
const timerTotalSeconds = (config: TimerConfig) => {
  switch (config.mode) {
    case "stopwatch":
      return null
    case "countdown":
      return config.seconds
    case "intervals":
      return (
        config.rounds * config.workSeconds +
        (config.rounds - 1) * config.restSeconds
      )
  }
}

// Without `at`, a running entry counts as nothing yet; pass the current time to include it.
const elapsedSeconds = (entries: TimeEntry[], at: UtcDatetime | null) =>
  entries.reduce((total, entry) => {
    const end = entry.endedAt ?? at
    return end === null
      ? total
      : total + Math.max(0, secondsBetween(entry.startedAt, end))
  }, 0)

const runningEntry = <Entry extends TimeEntry>(entries: Entry[]) =>
  entries.find((entry) => entry.endedAt === null) ?? null

// A countdown or interval timer can't log past its total, even if it was left running.
const stopTimeFor = (
  config: TimerConfig,
  entries: TimeEntry[],
  at: UtcDatetime
) => {
  const running = runningEntry(entries)
  const total = timerTotalSeconds(config)
  if (!running || total === null) return at
  const remaining = total - elapsedSeconds(entries, at)
  return remaining >= 0 ? at : addSeconds(at, remaining)
}

// When the run completes, the entry ends exactly at the total; the finish timeout
// starts at the tap, a moment before the entry is written, so `now` would fall short.
const finishTimeFor = (config: TimerConfig, entries: TimeEntry[]) => {
  const running = runningEntry(entries)
  const total = timerTotalSeconds(config)
  if (!running || total === null) return null
  return addSeconds(running.startedAt, total - elapsedSeconds(entries, null))
}

type TimerLap = { number: number; seconds: number; total: number }

// A lap spans every entry since the last lap, so a pause inside it doesn't count.
const timerLaps = (entries: (TimeEntry & { endsLap: boolean })[]) => {
  const laps: TimerLap[] = []
  let lapSeconds = 0
  let total = 0
  for (const entry of entries) {
    if (entry.endedAt === null) continue
    const seconds = Math.max(0, secondsBetween(entry.startedAt, entry.endedAt))
    lapSeconds += seconds
    total += seconds
    if (entry.endsLap) {
      laps.push({ number: laps.length + 1, seconds: lapSeconds, total })
      lapSeconds = 0
    }
  }
  return laps
}

const lapsAllowed = (config: TimerConfig) =>
  config.mode === "stopwatch" || config.mode === "countdown"

type TimerState =
  | { kind: "stopwatch"; elapsed: number }
  | { kind: "countdown"; total: number; remaining: number; finished: boolean }
  | {
      kind: "work" | "rest"
      round: number
      rounds: number
      remaining: number
    }
  | { kind: "finished"; rounds: number }

const timerState = (config: TimerConfig, elapsed: number): TimerState => {
  switch (config.mode) {
    case "stopwatch":
      return { kind: "stopwatch", elapsed }
    case "countdown": {
      const remaining = Math.max(0, config.seconds - elapsed)
      return {
        kind: "countdown",
        total: config.seconds,
        remaining,
        finished: remaining === 0,
      }
    }
    case "intervals": {
      const cycle = config.workSeconds + config.restSeconds
      const total = timerTotalSeconds(config) ?? 0
      if (elapsed >= total) return { kind: "finished", rounds: config.rounds }
      const index = Math.floor(elapsed / cycle)
      const intoCycle = elapsed - index * cycle
      const working = intoCycle < config.workSeconds
      return {
        kind: working ? "work" : "rest",
        round: index + 1,
        rounds: config.rounds,
        remaining: working ? config.workSeconds - intoCycle : cycle - intoCycle,
      }
    }
  }
}

type ScheduledCue = { atSecond: number; cue: TimerCue }

// Cues still ahead of `elapsed`; one exactly at `elapsed` counts, so pressing start plays the opening bell.
const upcomingCues = (config: TimerConfig, elapsed: number): ScheduledCue[] => {
  switch (config.mode) {
    case "stopwatch":
      return []
    case "countdown":
      return config.seconds > elapsed
        ? [{ atSecond: config.seconds, cue: "finish" }]
        : []
    case "intervals": {
      const cycle = config.workSeconds + config.restSeconds
      const cues = Array.from({ length: config.rounds }, (_, index) => {
        const start = index * cycle
        const isLast = index === config.rounds - 1
        const end = start + config.workSeconds
        return [
          { atSecond: start, cue: "work" as const },
          isLast
            ? { atSecond: end, cue: "finish" as const }
            : config.restSeconds > 0
              ? { atSecond: end, cue: "rest" as const }
              : null,
        ]
      })
        .flat()
        .filter((cue): cue is ScheduledCue => cue !== null)
      return cues.filter((cue) =>
        cue.atSecond === 0 ? elapsed === 0 : cue.atSecond > elapsed
      )
    }
  }
}

// Countdowns round up so they show 0:00 only once time is really up; stopwatches round down.
const formatClock = (seconds: number, rounding: "up" | "down") => {
  const whole = Math.max(
    0,
    rounding === "up" ? Math.ceil(seconds - 1e-6) : Math.floor(seconds)
  )
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, "0")
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`
}

// Accepts "90" (seconds), "1:30" and "1:02:03".
const parseClock = (input: string) => {
  const parts = input.trim().split(":")
  if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) {
    return null
  }
  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0)
  return Number.isSafeInteger(seconds) ? seconds : null
}

export {
  DEFAULT_TIMER,
  InvalidTimerError,
  MAX_TIMER_SECONDS,
  TIMER_MODES,
  TIMER_SOUNDS,
  elapsedSeconds,
  finishTimeFor,
  formatClock,
  lapsAllowed,
  parseClock,
  parseTimerConfig,
  resolveTimer,
  runningEntry,
  stopTimeFor,
  timerModeLabels,
  timerSoundLabels,
  timerState,
  timerLaps,
  timerTotalSeconds,
  upcomingCues,
  withMode,
}
export type {
  ScheduledCue,
  TimeEntry,
  TimerConfig,
  TimerCue,
  TimerLap,
  TimerMode,
  TimerSound,
  TimerState,
}
