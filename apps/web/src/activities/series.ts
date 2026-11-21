import { valueToSeconds } from "./duration"
import type { ActivityStatus } from "./status"
import type { TimerConfig, TimerSound } from "./timer"
import { clock } from "./routine-view"

const MAX_REPEAT = 50

// Kept as typed, so the field can be cleared and retyped; this is what it means.
const repeatCount = (text: string) =>
  Math.min(MAX_REPEAT, Math.max(1, Number.parseInt(text, 10) || 1))

// 00:00 is a stopwatch; any other duration counts down.
const timerFrom = (value: string, sound: TimerSound): TimerConfig => {
  const seconds = valueToSeconds(value)
  return seconds > 0 ? { mode: "down", seconds, sound } : { mode: "up", sound }
}

type Gap = {
  title: string
  // MM:SS as typed; 00:00 leaves the gap on its type's timer.
  duration: string
  typeId: string | null
  typeName: string | null
}

type SeriesStep = {
  title: string
  timer: TimerConfig | null
  typeId: string | null
  // "gap" is the rest or pause between repeats, as opposed to the repeated work.
  generated: "step" | "gap" | null
}

// A type alone is enough: the gap is named after it and plays its timer.
const hasGap = (gap: Gap) =>
  gap.title.trim() !== "" ||
  valueToSeconds(gap.duration) > 0 ||
  gap.typeId !== null

// A series created as done is done throughout, gaps included, or it would never read finished.
const stepStatus = (step: SeriesStep, status: ActivityStatus) =>
  step.generated === "gap" && status !== "done" ? "todo" : status

const gapTitleOf = (gap: Gap, title: string) => {
  const seconds = valueToSeconds(gap.duration)
  return (
    gap.title.trim() || gap.typeName || (seconds > 0 ? clock(seconds) : title)
  )
}

// Repeats and gaps are generated, so they tick themselves done as the routine passes them.
const seriesSteps = ({
  title,
  timer,
  typeId,
  repeat,
  gap,
  sound,
}: {
  title: string
  timer: TimerConfig | null
  typeId: string | null
  repeat: number
  gap: Gap
  sound: TimerSound
}): SeriesStep[] => {
  if (repeat <= 1) return [{ title, timer, typeId, generated: null }]
  const between = hasGap(gap)
  const gapSeconds = valueToSeconds(gap.duration)
  const gapStep: SeriesStep = {
    title: gapTitleOf(gap, title),
    timer: gapSeconds > 0 ? timerFrom(gap.duration, sound) : null,
    typeId: gap.typeId,
    generated: "gap",
  }
  return Array.from({ length: repeat }, (_, index) => [
    {
      title: `${title} ${index + 1}`,
      timer,
      typeId,
      generated: "step" as const,
    },
    ...(between && index < repeat - 1 ? [gapStep] : []),
  ]).flat()
}

// The Repeat chip's label: "×4 · Rest 1:00".
const repeatLabel = (repeat: number, gap: Gap) => {
  if (repeat <= 1) return "Repeat"
  if (!hasGap(gap)) return `×${repeat}`
  const seconds = valueToSeconds(gap.duration)
  const name = gap.title.trim() || gap.typeName || "gap"
  return `×${repeat} · ${name}${seconds > 0 ? ` ${clock(seconds)}` : ""}`
}

export {
  MAX_REPEAT,
  repeatCount,
  repeatLabel,
  seriesSteps,
  stepStatus,
  timerFrom,
}
export type { Gap }
