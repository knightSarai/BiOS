import {
  addSeconds,
  secondsBetween,
  type UtcDatetime,
} from "@knight-os/server/core"
import type { TimerConfig, TimerSound } from "@/activities/timer"

// Timers before up/down: a stopwatch, a countdown, or rounds of work and rest in one activity.
type LegacyTimer =
  | { mode: "stopwatch"; sound: TimerSound }
  | { mode: "countdown"; seconds: number; sound: TimerSound }
  | {
      mode: "intervals"
      workSeconds: number
      restSeconds: number
      rounds: number
      sound: TimerSound
    }

type LegacyEntry = {
  id: string
  startedAt: UtcDatetime
  endedAt: UtcDatetime | null
  endsLap: boolean
}

type GeneratedChild = {
  title: string
  timer: TimerConfig
  // Rounds keep the activity's type; the rests between them ("gap") have none.
  kind: "step" | "gap"
}

const isLegacy = (timer: unknown): timer is LegacyTimer =>
  typeof timer === "object" &&
  timer !== null &&
  "mode" in timer &&
  (timer.mode === "stopwatch" ||
    timer.mode === "countdown" ||
    timer.mode === "intervals")

// Intervals become a parent that counts up; its rounds and rests are generated below it.
const upgradeTimer = (timer: unknown): TimerConfig | null => {
  if (!isLegacy(timer)) return (timer as TimerConfig | null) ?? null
  switch (timer.mode) {
    case "stopwatch":
    case "intervals":
      return { mode: "up", sound: timer.sound }
    case "countdown":
      return { mode: "down", seconds: timer.seconds, sound: timer.sound }
  }
}

// A type can't hold rounds, so an intervals type keeps the length of one round of work.
const upgradeTypeTimer = (timer: unknown): TimerConfig | null =>
  isLegacy(timer) && timer.mode === "intervals"
    ? { mode: "down", seconds: timer.workSeconds, sound: timer.sound }
    : upgradeTimer(timer)

// The last round has no rest after it, as before.
const intervalChildren = (timer: unknown): GeneratedChild[] => {
  if (!isLegacy(timer) || timer.mode !== "intervals") return []
  return Array.from({ length: timer.rounds }, (_, index) => [
    {
      title: `Round ${index + 1}`,
      timer: {
        mode: "down" as const,
        seconds: timer.workSeconds,
        sound: timer.sound,
      },
      kind: "step" as const,
    },
    ...(index < timer.rounds - 1 && timer.restSeconds > 0
      ? [
          {
            title: "Rest",
            timer: {
              mode: "down" as const,
              seconds: timer.restSeconds,
              sound: timer.sound,
            },
            kind: "gap" as const,
          },
        ]
      : []),
  ]).flat()
}

// `ended`: the lap was closed by pressing Lap. Time after the last one is a lap still open,
// whether it's running or paused.
type LapGroup = { title: string; entryIds: string[]; ended: boolean }

// Each lap held every entry since the one before, so pauses inside a lap stay in it. Time
// after the last lap becomes one more lap, so nothing logged is left on the parent.
const lapGroups = (entries: LegacyEntry[]): LapGroup[] => {
  if (!entries.some((entry) => entry.endsLap)) return []
  const sorted = [...entries].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt)
  )
  const groups: LapGroup[] = []
  let current: string[] = []
  for (const entry of sorted) {
    current.push(entry.id)
    if (entry.endsLap) {
      groups.push({
        title: `Lap ${groups.length + 1}`,
        entryIds: current,
        ended: entry.endedAt !== null,
      })
      current = []
    }
  }
  if (current.length > 0) {
    groups.push({
      title: `Lap ${groups.length + 1}`,
      entryIds: current,
      ended: false,
    })
  }
  return groups
}

// A running parent's length is what its generated steps count down; null when one of them
// counts up, since then nobody knows when it would have ended.
const stepsTotal = (timers: (TimerConfig | null)[]) =>
  timers.every((timer) => timer?.mode === "down")
    ? timers.reduce(
        (total, timer) => total + (timer?.mode === "down" ? timer.seconds : 0),
        0
      )
    : null

// How long a legacy timer ran before it stopped by itself: a countdown's length, or every
// round and rest of intervals. Null when it never would have.
const legacyLength = (timer: unknown) => {
  if (!isLegacy(timer)) return null
  if (timer.mode === "countdown") return timer.seconds
  if (timer.mode === "intervals") {
    return stepsTotal(intervalChildren(timer).map((child) => child.timer))
  }
  return null
}

const loggedSeconds = (
  entries: { startedAt: UtcDatetime; endedAt: UtcDatetime | null }[]
) =>
  entries.reduce(
    (total, entry) =>
      entry.endedAt === null
        ? total
        : total + Math.max(0, secondsBetween(entry.startedAt, entry.endedAt)),
    0
  )

// A countdown left running when the upgrade stops it ends where it would have finished (its
// length less what was logged before), not at the upgrade, which could be months later. A
// count-up (no known length) never ends by itself, so it ends at the upgrade, as a running
// count-up on any other activity keeps counting until you stop it.
const stoppedAt = (
  startedAt: UtcDatetime,
  total: number | null,
  logged: number,
  upgradedAt: UtcDatetime
) => {
  if (startedAt >= upgradedAt) return startedAt
  if (total === null) return upgradedAt
  const finish = addSeconds(startedAt, Math.max(0, total - logged))
  return finish < upgradedAt ? finish : upgradedAt
}

type RunFloors = {
  id: string
  runStart: UtcDatetime | null
  joinedAt?: Record<string, UtcDatetime>
  attemptFrom: Record<string, UtcDatetime>
}

// Where the current attempt on an activity began, by its routine's run: only timer time
// since then counts toward a running countdown, as the timer counts it. "" when every
// earlier entry counts.
const attemptStarts = (
  rows: { id: string; parentId: string | null }[],
  runs: RunFloors[]
) => {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const runOf = new Map(runs.map((run) => [run.id, run]))
  const rootOf = (id: string) => {
    let row = byId.get(id)
    const seen = new Set<string>()
    while (row?.parentId && !seen.has(row.parentId) && byId.has(row.parentId)) {
      seen.add(row.id)
      row = byId.get(row.parentId)
    }
    return row?.id ?? id
  }
  return (id: string) => {
    const run = runOf.get(rootOf(id))
    return [
      run?.runStart,
      run?.joinedAt?.[id],
      run?.attemptFrom[id],
    ].reduce<string>((latest, at) => (at && at > latest ? at : latest), "")
  }
}

// The timer time a countdown has run in its current attempt; time typed in never moves it.
const attemptSeconds = (
  entries: {
    activityId: string
    startedAt: UtcDatetime
    endedAt: UtcDatetime | null
    source?: string
  }[],
  id: string,
  from: string
) =>
  loggedSeconds(
    entries.filter(
      (entry) =>
        entry.activityId === id &&
        entry.source !== "manual" &&
        entry.startedAt >= from
    )
  )

type SeriesChild = { id: string; title: string; typeId: string | null }

// Before gaps were marked, a series told its rests apart by type. Repeats are numbered
// "Title 1", "Title 2"… with the same gap between each, so the gaps are the children that
// alternate with them; a "Rest" with no type was always one.
const gapsIn = (children: SeriesChild[]) => {
  const between = children.filter((_, index) => index % 2 === 1)
  const work = children.filter((_, index) => index % 2 === 0)
  const first = between[0]
  const alternates =
    first !== undefined &&
    work.length === between.length + 1 &&
    between.every(
      (child) =>
        child.title.trim() === first.title.trim() &&
        child.typeId === first.typeId
    ) &&
    work.every((child, index) => child.title.trim().endsWith(` ${index + 1}`))
  const gaps = new Set(alternates ? between.map((child) => child.id) : [])
  for (const child of children) {
    if (child.title.trim() === "Rest" && child.typeId === null) {
      gaps.add(child.id)
    }
  }
  return gaps
}

export {
  attemptSeconds,
  attemptStarts,
  gapsIn,
  intervalChildren,
  legacyLength,
  lapGroups,
  loggedSeconds,
  stepsTotal,
  stoppedAt,
  upgradeTimer,
  upgradeTypeTimer,
}
export type { LegacyEntry }
