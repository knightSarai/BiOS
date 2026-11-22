// Time added after an activity is done: how long it took and when it ended, saved as one total
// on the activity. Pure, so the timer and the new-activity form lay sessions out the same way.

import {
  addSeconds,
  formatActivityTimestamp,
  localDateTimeToUtc,
  parseUtc,
  secondsBetween,
  toLocalDate,
  toLocalTime,
  type UtcDatetime,
} from "@knight-os/server/core"
import { EMPTY, secondsToValue, valueToSeconds } from "./duration"
import { nodesOf, type RoutineNode, type Run } from "./routine"
import { MAX_TIMER_SECONDS } from "./timer"

// When the session ended, as a wall-clock time in the workspace; null is "just now". `exact`
// is the instant the timer stopped, kept to the second until the time is changed by hand.
type When = { date: string; time: string; exact?: UtcDatetime } | null

type Part = { activityId: string; seconds: number }

const endOf = (when: When, timezone: string, now: UtcDatetime) =>
  when === null
    ? now
    : (when.exact ?? localDateTimeToUtc(when.date, when.time, timezone))

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

// What the timer counted and nobody saved: how long, and when it last stopped.
type Counted = { seconds: number; endedAt: UtcDatetime | null }

const latest = (a: UtcDatetime | null, b: UtcDatetime) =>
  a === null || secondsBetween(a, b) > 0 ? b : a

// Stretches are summed before rounding, so short ones still add up to whole seconds.
const countedOf = (
  stretches: { seconds: number; endedAt: UtcDatetime }[]
): Counted => ({
  seconds: Math.round(
    stretches.reduce((total, stretch) => total + stretch.seconds, 0)
  ),
  endedAt: stretches.reduce<UtcDatetime | null>(
    (end, stretch) => latest(end, stretch.endedAt),
    null
  ),
})

const EPOCH = parseUtc("1970-01-01T00:00:00.000Z")

// Timer time still waiting on done activities at or under this one (a step that ticked
// itself): exactly what saving added time replaces, so Add time opened by hand starts from it.
const waitingOf = (node: RoutineNode, run: Run) => {
  const ids = new Set(nodesOf(node).map((each) => each.id))
  return countedOf(
    run.entries.flatMap((entry) =>
      !entry.manual &&
      entry.recording === "pending" &&
      entry.end !== null &&
      entry.end > entry.start &&
      ids.has(entry.activityId) &&
      run.done.includes(entry.activityId)
        ? [
            {
              seconds: entry.end - entry.start,
              endedAt: addSeconds(EPOCH, entry.end),
            },
          ]
        : []
    )
  )
}

// The offer to add time on a page: where it opened from, whether it's open, what the last
// Done counted, and how many timer actions its routine had seen when it was made.
type Offer = {
  counted: Counted | null
  from: "status" | "timer"
  open: boolean
  actions: number
}

// Opening it by hand (no count given) keeps the count while nothing has happened on the
// timer since; a Done gives its own, null when it dropped nothing, so the form reads the
// time still waiting instead of an earlier Done's.
const offerShown = (
  was: Offer | null,
  from: Offer["from"],
  counted: Counted | null | undefined,
  actions: number
): Offer => ({
  counted:
    counted !== undefined
      ? counted
      : was !== null && was.actions === actions
        ? was.counted
        : null,
  from,
  open: true,
  actions,
})

type LogDraft = { took: string; when: When }

// How long starts at what the timer counted, ending when it last stopped; with nothing
// counted it starts empty.
const addTimeDraft = (counted: Counted, timezone: string): LogDraft => ({
  took: counted.seconds > 0 ? secondsToValue(counted.seconds) : EMPTY,
  when:
    counted.seconds > 0 && counted.endedAt
      ? { ...whenNow(timezone, counted.endedAt), exact: counted.endedAt }
      : null,
})

// A session can be at most a day, so a longer stretch is saved as several back to back.
const withinADay = (part: Part): Part[] =>
  part.seconds > MAX_TIMER_SECONDS
    ? [
        ...withinADay({ ...part, seconds: part.seconds - MAX_TIMER_SECONDS }),
        { ...part, seconds: MAX_TIMER_SECONDS },
      ]
    : [part]

// What Save records: one total on the activity, ending at Ended.
const logPlan = (
  node: RoutineNode,
  draft: LogDraft,
  timezone: string,
  now: UtcDatetime
) => {
  const sessions = backToBack(
    withinADay({ activityId: node.id, seconds: valueToSeconds(draft.took) }),
    endOf(draft.when, timezone, now)
  )
  if (sessions.length === 0) return { error: "Type how long it took." } as const
  return { sessions } as const
}

export {
  addTimeDraft,
  backToBack,
  countedOf,
  endOf,
  logPlan,
  offerShown,
  waitingOf,
  whenLabel,
  whenNow,
}
export type { Counted, LogDraft, Offer, When }
