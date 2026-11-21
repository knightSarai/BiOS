import { describe, expect, it } from "vitest"
import { parseUtc } from "@knight-os/server/core"
import {
  backToBack,
  logPlan,
  marksDone,
  splitRows,
  tookDefault,
  whenLabel,
} from "./log-time"
import { withCanceledInside, type RoutineNode, type Run } from "./routine"

const down = (seconds: number) => ({
  mode: "down" as const,
  seconds,
  sound: "none" as const,
})
const up = { mode: "up" as const, sound: "none" as const }

const node = (
  id: string,
  timer: RoutineNode["timer"],
  children: RoutineNode[] = []
): RoutineNode => ({
  id,
  title: id,
  timer,
  typeId: null,
  generated: null,
  series: false,
  children,
})

// A release checklist: a timed review, a group of two checks, then notes at your own pace.
const release = node("release", up, [
  node("review", down(600)),
  node("checks", up, [node("smoke", down(300)), node("perf", down(900))]),
  node("notes", up),
])

const solo = node("solo", down(90))

const fresh: Run = {
  entries: [],
  cursor: null,
  passed: [],
  done: [],
  canceled: [],
  replay: [],
  scopeId: null,
  runStart: 0,
  attemptFrom: {},
  joinedAt: {},
  started: false,
}

const now = parseUtc("2026-11-11T09:00:00.000Z")
const at = (time: string) => parseUtc(`2026-11-11T${time}.000Z`)

const draft = {
  split: false,
  took: "25:00",
  parts: {},
  when: null,
  done: true,
}

describe("backToBack", () => {
  it("lays sessions end to end, the last one ending at When", () => {
    expect(
      backToBack(
        [
          { activityId: "a", seconds: 600 },
          { activityId: "b", seconds: 300 },
        ],
        at("09:00:00")
      )
    ).toEqual([
      { activityId: "a", startedAt: at("08:45:00"), endedAt: at("08:55:00") },
      { activityId: "b", startedAt: at("08:55:00"), endedAt: at("09:00:00") },
    ])
  })

  it("skips parts left at zero without leaving a gap", () => {
    expect(
      backToBack(
        [
          { activityId: "a", seconds: 60 },
          { activityId: "b", seconds: 0 },
          { activityId: "c", seconds: 120 },
          { activityId: "d", seconds: 0 },
        ],
        at("09:00:00")
      )
    ).toEqual([
      { activityId: "a", startedAt: at("08:57:00"), endedAt: at("08:58:00") },
      { activityId: "c", startedAt: at("08:58:00"), endedAt: at("09:00:00") },
    ])
  })
})

describe("splitRows", () => {
  it("lists each timed activity in order, countdowns prefilled and count-ups at zero", () => {
    expect(
      splitRows(release, fresh, release).map(
        (row) => [row.node.id, row.took] as const
      )
    ).toEqual([
      ["review", "10:00"],
      ["smoke", "05:00"],
      ["perf", "15:00"],
      ["notes", "00:00"],
    ])
  })

  it("paused partway, prefills 00:00 for what's done, passed or logged in this run, timed or typed in", () => {
    const run: Run = {
      ...fresh,
      runStart: 100,
      started: true,
      cursor: "perf",
      done: ["review"],
      passed: ["smoke"],
      canceled: ["notes"],
      entries: [
        { id: "e0", activityId: "review", start: 100, end: 160, manual: false },
        { id: "e1", activityId: "perf", start: 50, end: 80, manual: false },
      ],
    }
    expect(
      splitRows(release, run, release).map(
        (row) => [row.node.id, row.took] as const
      )
    ).toEqual([
      ["review", "00:00"],
      ["smoke", "00:00"],
      ["perf", "15:00"],
    ])
    const typedIn: Run = {
      ...run,
      entries: [
        ...run.entries,
        {
          id: "e2",
          activityId: "perf",
          start: 20,
          end: 80,
          manual: true,
          logged: 120,
        },
      ],
    }
    expect(splitRows(release, typedIn, release).map((row) => row.took)).toEqual(
      ["00:00", "00:00", "00:00"]
    )
  })

  it("idle or finished, prefills every countdown and leaves out only canceled ones", () => {
    const finished: Run = {
      ...fresh,
      runStart: 100,
      done: ["review"],
      passed: ["smoke", "perf"],
      canceled: ["notes"],
      entries: [
        { id: "e0", activityId: "review", start: 100, end: 700, manual: false },
      ],
    }
    expect(
      splitRows(release, finished, release).map(
        (row) => [row.node.id, row.took] as const
      )
    ).toEqual([
      ["review", "10:00"],
      ["smoke", "05:00"],
      ["perf", "15:00"],
    ])
  })

  it("counts a part played on its own that finished as mid-run, with no cursor left", () => {
    const scopeDone: Run = {
      ...fresh,
      runStart: 100,
      started: true,
      cursor: null,
      scopeId: "checks",
      passed: ["smoke", "perf"],
      entries: [
        { id: "e0", activityId: "smoke", start: 100, end: 400, manual: false },
        { id: "e1", activityId: "perf", start: 400, end: 1300, manual: false },
      ],
    }
    expect(
      splitRows(release, scopeDone, release).map(
        (row) => [row.node.id, row.took] as const
      )
    ).toEqual([
      ["review", "10:00"],
      ["smoke", "00:00"],
      ["perf", "00:00"],
      ["notes", "00:00"],
    ])
  })

  it("counts a finished routine with an activity reopened as mid-run", () => {
    const reopened: Run = {
      ...fresh,
      runStart: 100,
      started: true,
      cursor: null,
      done: ["review", "notes"],
      passed: ["smoke"],
      entries: [
        { id: "e0", activityId: "review", start: 100, end: 700, manual: false },
        { id: "e1", activityId: "smoke", start: 700, end: 1000, manual: false },
        { id: "e2", activityId: "perf", start: 1000, end: 1900, manual: false },
        {
          id: "e3",
          activityId: "notes",
          start: 1900,
          end: 2000,
          manual: false,
        },
      ],
    }
    expect(
      splitRows(release, reopened, release).map(
        (row) => [row.node.id, row.took] as const
      )
    ).toEqual([
      ["review", "00:00"],
      ["smoke", "00:00"],
      ["perf", "00:00"],
      ["notes", "00:00"],
    ])
    const untimed: Run = {
      ...reopened,
      entries: reopened.entries.filter((entry) => entry.activityId !== "perf"),
    }
    expect(tookDefault(release, untimed, release)).toBe("15:00")
  })

  it("judges mid-run by the whole routine, not the page it's logged from", () => {
    const checks = release.children[1]
    const pausedOnNotes: Run = {
      ...fresh,
      runStart: 100,
      started: true,
      cursor: "notes",
      passed: ["review", "smoke", "perf"],
      entries: [
        { id: "e0", activityId: "review", start: 100, end: 700, manual: false },
        { id: "e1", activityId: "smoke", start: 700, end: 1000, manual: false },
        { id: "e2", activityId: "perf", start: 1000, end: 1900, manual: false },
        {
          id: "e3",
          activityId: "notes",
          start: 1900,
          end: 1950,
          manual: false,
        },
      ],
    }
    expect(
      splitRows(checks, pausedOnNotes, release).map(
        (row) => [row.node.id, row.took] as const
      )
    ).toEqual([
      ["smoke", "00:00"],
      ["perf", "00:00"],
    ])
    expect(tookDefault(checks, pausedOnNotes, release)).toBe("00:00")

    const checksDone: Run = {
      ...fresh,
      runStart: 100,
      started: true,
      scopeId: "checks",
      passed: ["smoke", "perf"],
      entries: [
        { id: "e0", activityId: "smoke", start: 100, end: 400, manual: false },
        { id: "e1", activityId: "perf", start: 400, end: 1300, manual: false },
      ],
    }
    expect(
      splitRows(checks, checksDone, release).map(
        (row) => [row.node.id, row.took] as const
      )
    ).toEqual([
      ["smoke", "00:00"],
      ["perf", "00:00"],
    ])
  })

  it("never played, counts time typed in earlier as a separate session", () => {
    const checks = release.children[1]
    const typedInBefore: Run = {
      ...fresh,
      entries: [
        {
          id: "e0",
          activityId: "smoke",
          start: 20,
          end: 320,
          manual: true,
          logged: 400,
        },
      ],
    }
    expect(
      splitRows(checks, typedInBefore, release).map(
        (row) => [row.node.id, row.took] as const
      )
    ).toEqual([
      ["smoke", "05:00"],
      ["perf", "15:00"],
    ])
    expect(tookDefault(release, typedInBefore, release)).toBe("30:00")
  })

  it("never played, leaves out what was typed in and ticked done", () => {
    const checks = release.children[1]
    const smokeDone: Run = {
      ...fresh,
      done: ["smoke"],
      entries: [
        {
          id: "e0",
          activityId: "smoke",
          start: 20,
          end: 320,
          manual: true,
          logged: 400,
        },
      ],
    }
    expect(
      splitRows(checks, smokeDone, release).map(
        (row) => [row.node.id, row.took] as const
      )
    ).toEqual([
      ["smoke", "00:00"],
      ["perf", "15:00"],
    ])
    expect(tookDefault(release, smokeDone, release)).toBe("25:00")
  })

  it("has nothing to split on an activity without sub-activities", () => {
    expect(splitRows(solo, fresh, solo)).toEqual([])
  })
})

describe("tookDefault", () => {
  it("is what the split rows add up to, under the same rule", () => {
    expect(tookDefault(release, fresh, release)).toBe("30:00")
    const paused: Run = {
      ...fresh,
      runStart: 100,
      started: true,
      cursor: "smoke",
      done: ["review"],
      entries: [
        { id: "e0", activityId: "review", start: 100, end: 160, manual: false },
      ],
    }
    expect(tookDefault(release, paused, release)).toBe("20:00")
    expect(tookDefault(solo, fresh, solo)).toBe("01:30")
    expect(tookDefault(solo, { ...fresh, canceled: ["solo"] }, solo)).toBe(
      "00:00"
    )
  })
})

describe("logPlan", () => {
  it("logs one total on the activity itself, ending just now", () => {
    expect(logPlan(release, fresh, release, draft, "UTC", now)).toEqual({
      sessions: [
        {
          activityId: "release",
          startedAt: at("08:35:00"),
          endedAt: at("09:00:00"),
        },
      ],
      done: ["release"],
      groups: [],
    })
  })

  it("reads When in the workspace timezone", () => {
    const plan = logPlan(
      release,
      fresh,
      release,
      {
        ...draft,
        took: "1:00:00",
        when: { date: "2026-11-10", time: "19:30" },
        done: false,
      },
      "Australia/Sydney",
      now
    )
    expect(plan).toEqual({
      sessions: [
        {
          activityId: "release",
          startedAt: parseUtc("2026-11-10T07:30:00.000Z"),
          endedAt: parseUtc("2026-11-10T08:30:00.000Z"),
        },
      ],
      done: [],
      groups: [],
    })
  })

  it("splits by sub-activity, skipping the ones at zero, and ticks what was logged", () => {
    const plan = logPlan(
      release,
      fresh,
      release,
      { ...draft, split: true, parts: { smoke: "00:00", notes: "02:00" } },
      "UTC",
      now
    )
    expect(plan).toEqual({
      sessions: [
        {
          activityId: "review",
          startedAt: at("08:33:00"),
          endedAt: at("08:43:00"),
        },
        {
          activityId: "perf",
          startedAt: at("08:43:00"),
          endedAt: at("08:58:00"),
        },
        {
          activityId: "notes",
          startedAt: at("08:58:00"),
          endedAt: at("09:00:00"),
        },
      ],
      done: ["review", "perf", "notes", "release"],
      groups: ["checks"],
    })
  })

  it("never marks a canceled activity done, nor anything in a canceled group", () => {
    const canceled = withCanceledInside(release, {
      ...fresh,
      canceled: ["release"],
    })
    expect(marksDone(release, canceled, draft)).toBe(false)
    expect(
      logPlan(release, canceled, release, draft, "UTC", now)
    ).toMatchObject({
      done: [],
    })
    expect(splitRows(release, canceled, release)).toEqual([])

    const checks: Run = { ...fresh, canceled: ["checks"] }
    expect(
      splitRows(release, checks, release).map(
        (row) => [row.node.id, row.took] as const
      )
    ).toEqual([
      ["review", "10:00"],
      ["notes", "00:00"],
    ])
    expect(
      logPlan(
        release,
        checks,
        release,
        { ...draft, split: true, parts: { review: "00:00", notes: "02:00" } },
        "UTC",
        now
      )
    ).toEqual({
      sessions: [
        {
          activityId: "notes",
          startedAt: at("08:58:00"),
          endedAt: at("09:00:00"),
        },
      ],
      done: ["notes", "release"],
      groups: [],
    })
  })

  it("asks for a duration when nothing was typed", () => {
    expect(
      logPlan(release, fresh, release, { ...draft, took: "00:00" }, "UTC", now)
    ).toEqual({
      error: "Type how long it took.",
    })
    expect(
      logPlan(
        release,
        fresh,
        release,
        {
          ...draft,
          split: true,
          parts: {
            review: "00:00",
            smoke: "00:00",
            perf: "00:00",
            notes: "00:00",
          },
        },
        "UTC",
        now
      )
    ).toEqual({ error: "Type how long at least one of them took." })
  })
})

describe("whenLabel", () => {
  it("reads just now, or the day and time in the workspace", () => {
    expect(whenLabel(null, "UTC", now)).toBe("Just now")
    expect(
      whenLabel({ date: "2026-11-10", time: "18:30" }, "Europe/London", now)
    ).toBe("Yesterday · 18:30")
  })
})
