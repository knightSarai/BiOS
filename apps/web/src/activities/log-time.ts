// Time typed in afterwards, for a session done without the timer: how long it took and when
// it ended. Pure, so the timer card and the new-activity form lay sessions out the same way.

import {
  addSeconds,
  formatActivityTimestamp,
  localDateTimeToUtc,
  toLocalDate,
  toLocalTime,
  type UtcDatetime,
} from "@knight-os/server/core"
import { EMPTY, secondsToValue, valueToSeconds } from "./duration"
import {
  entriesInRun,
  isBehind,
  isCanceled,
  leavesOf,
  nodesOf,
  withCanceledInside,
  type RoutineNode,
  type Run,
} from "./routine"

// When the session ended, as a wall-clock time in the workspace; null is "just now".
type When = { date: string; time: string } | null

type Part = { activityId: string; seconds: number }

const endOf = (when: When, timezone: string, now: UtcDatetime) =>
  when === null ? now : localDateTimeToUtc(when.date, when.time, timezone)

const whenLabel = (when: When, timezone: string, now: UtcDatetime) =>
  when === null
    ? "Just now"
    : formatActivityTimestamp(endOf(when, timezone, now), timezone, now)

// Picking a day starts from the time it is now, so only the day needs changing.
const whenNow = (timezone: string, now: UtcDatetime): NonNullable<When> => ({
  date: toLocalDate(now, timezone),
  time: toLocalTime(now, timezone),
})

// One after another, the last ending at `end`; parts left at zero weren't done, so they're
// skipped rather than logged empty.
const backToBack = (parts: Part[], end: UtcDatetime) =>
  parts
    .filter((part) => part.seconds > 0)
    .reduceRight<
      { activityId: string; startedAt: UtcDatetime; endedAt: UtcDatetime }[]
    >((later, part) => {
      const endedAt = later[0]?.startedAt ?? end
      return [
        {
          activityId: part.activityId,
          startedAt: addSeconds(endedAt, -part.seconds),
          endedAt,
        },
        ...later,
      ]
    }, [])

const loggedInRun = (run: Run) =>
  entriesInRun(run).filter(
    (entry) => entry.end === null || entry.end > entry.start
  )

// Each activity prefilled with its countdown; a count-up starts at 00:00. Partway through a
// run the timer played (time in it, and the routine stopped short of its end), what's
// already done, passed or logged in it (timed or typed in) starts at 00:00 too, so it isn't
// logged twice. That's judged on the whole routine, not the page: a group whose activities
// are all behind is still mid-run while the routine goes on. Untouched or played to the
// end, it's a whole session done without the app, so everything gets its countdown.
// Canceled ones weren't done, so they're left out.
const prefilled = (node: RoutineNode, given: Run, root: RoutineNode) => {
  const run = withCanceledInside(root, given)
  const logged = new Set(loggedInRun(run).map((entry) => entry.activityId))
  // Ticking an activity done when its time was typed in counts as starting the routine, so
  // the rest of it, done without the app later, doesn't log that activity again.
  const midRun =
    (run.started ||
      leavesOf(root).some((leaf) => run.done.includes(leaf.node.id))) &&
    logged.size > 0 &&
    (run.cursor !== null ||
      !leavesOf(root).every((leaf) => isBehind(run, leaf.node.id)))
  const accountedFor = (id: string) =>
    midRun &&
    (run.done.includes(id) || run.passed.includes(id) || logged.has(id))
  return leavesOf(node)
    .filter((leaf) => !isCanceled(run, leaf.node.id))
    .map((leaf) => ({
      node: leaf.node,
      seconds:
        leaf.node.timer.mode === "down" && !accountedFor(leaf.node.id)
          ? leaf.node.timer.seconds
          : 0,
    }))
}

// The activities a split asks about, in order. An activity without sub-activities has
// nothing to split.
const splitRows = (node: RoutineNode, run: Run, root: RoutineNode) =>
  node.children.length === 0
    ? []
    : prefilled(node, run, root).map((row) => ({
        node: row.node,
        took: row.seconds > 0 ? secondsToValue(row.seconds) : EMPTY,
      }))

const tookDefault = (node: RoutineNode, run: Run, root: RoutineNode) => {
  const seconds = prefilled(node, run, root).reduce(
    (total, row) => total + row.seconds,
    0
  )
  return seconds > 0 ? secondsToValue(seconds) : EMPTY
}

// A canceled activity stays canceled, so Mark done never applies to it.
const marksDone = (
  node: RoutineNode,
  run: Run,
  draft: Pick<LogDraft, "done">
) => draft.done && !isCanceled(run, node.id)

type LogDraft = {
  split: boolean
  took: string
  parts: Record<string, string>
  when: When
  done: boolean
}

// The groups between the activity and what was logged on its sub-activities, the deepest
// first, so each is looked at after the groups inside it.
const groupsLogged = (node: RoutineNode, logged: Set<string>) =>
  nodesOf(node)
    .filter(
      (each) =>
        each.id !== node.id &&
        each.children.length > 0 &&
        nodesOf(each).some((inside) => logged.has(inside.id))
    )
    .reverse()
    .map((each) => each.id)

// What a filled-in Log time form saves: one session on the activity, or one per
// sub-activity laid back to back. Mark done ticks what was logged and the activity itself,
// and each group in between once nothing in it is left open (`groups`); canceled stays
// canceled.
const logPlan = (
  node: RoutineNode,
  given: Run,
  root: RoutineNode,
  draft: LogDraft,
  timezone: string,
  now: UtcDatetime
) => {
  const run = withCanceledInside(root, given)
  const end = endOf(draft.when, timezone, now)
  const parts = draft.split
    ? splitRows(node, run, root).map((row) => ({
        activityId: row.node.id,
        seconds: valueToSeconds(draft.parts[row.node.id] ?? row.took),
      }))
    : [{ activityId: node.id, seconds: valueToSeconds(draft.took) }]
  const sessions = backToBack(parts, end)
  if (sessions.length === 0) {
    return {
      error: draft.split
        ? "Type how long at least one of them took."
        : "Type how long it took.",
    } as const
  }
  const logged = new Set(sessions.map((session) => session.activityId))
  const open = (id: string) => !isCanceled(run, id)
  const done = marksDone(node, run, draft)
    ? [...new Set([...logged, node.id])].filter(open)
    : []
  const groups = marksDone(node, run, draft)
    ? groupsLogged(node, logged).filter(open)
    : []
  return { sessions, done, groups } as const
}

export {
  backToBack,
  endOf,
  logPlan,
  marksDone,
  splitRows,
  tookDefault,
  whenLabel,
  whenNow,
}
export type { LogDraft, When }
