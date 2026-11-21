import { z } from "zod"

// Every activity has one timer that counts up or down. Repeated rounds and laps are
// sub-activities of their own, so a routine is composed rather than configured.
const TIMER_MODES = ["up", "down"] as const

const TIMER_SOUNDS = ["none", "bell", "beep", "chime"] as const

const MAX_TIMER_SECONDS = 24 * 60 * 60

const timerSeconds = z.number().int().min(1).max(MAX_TIMER_SECONDS)

const timerSound = z.enum(TIMER_SOUNDS)

const timerConfigSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("up"), sound: timerSound }),
  z.object({
    mode: z.literal("down"),
    seconds: timerSeconds,
    sound: timerSound,
  }),
])

type TimerConfig = z.infer<typeof timerConfigSchema>

type TimerMode = TimerConfig["mode"]

type TimerSound = z.infer<typeof timerSound>

type TimerCue = "work" | "rest" | "finish"

const DEFAULT_TIMER: TimerConfig = { mode: "up", sound: "none" }

const timerModeLabels: Record<TimerMode, string> = {
  up: "Counts up",
  down: "Counts down",
}

const timerSoundLabels: Record<TimerSound, string> = {
  none: "No sound",
  bell: "Bell",
  beep: "Beep",
  chime: "Chime",
}

class InvalidTimerError extends Error {}

const parseTimerConfig = (config: unknown): TimerConfig => {
  const parsed = timerConfigSchema.safeParse(config)
  if (!parsed.success) throw new InvalidTimerError("Invalid timer settings.")
  return parsed.data
}

// The activity's own settings win; without them it uses its type's, then a silent count-up.
const resolveTimer = (
  activityTimer: TimerConfig | null,
  typeTimer: TimerConfig | null
) => activityTimer ?? typeTimer ?? DEFAULT_TIMER

// Switching mode keeps the sound; a new countdown starts at ten minutes.
const withMode = (config: TimerConfig, mode: TimerMode): TimerConfig => {
  if (config.mode === mode) return config
  return mode === "up"
    ? { mode, sound: config.sound }
    : { mode, seconds: 10 * 60, sound: config.sound }
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
  formatClock,
  parseClock,
  parseTimerConfig,
  resolveTimer,
  timerModeLabels,
  timerSoundLabels,
  withMode,
}
export type { TimerConfig, TimerCue, TimerMode, TimerSound }
