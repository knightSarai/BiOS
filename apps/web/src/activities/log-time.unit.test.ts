import { describe, expect, it } from "vitest"
import { parseUtc } from "@knight-os/server/core"
import {
  addTimeDraft,
  backToBack,
  countedOf,
  endOf,
  logPlan,
  offerShown,
  waitingOf,
  whenLabel,
} from "./log-time"
import type { RoutineNode } from "./routine"

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

const now = parseUtc("2026-11-11T09:00:00.000Z")
const at = (time: string) => parseUtc(`2026-11-11T${time}.000Z`)

const draft = { took: "25:00", when: null }

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

describe("adding time after Done", () => {
  const stopped = at("08:40:04")

  it("adds up what the timer counted and when it last stopped, rounding once", () => {
    expect(
      countedOf([
        { seconds: 0.4, endedAt: at("08:30:00") },
        { seconds: 0.4, endedAt: stopped },
        { seconds: 0.4, endedAt: at("08:35:00") },
      ])
    ).toEqual({ seconds: 1, endedAt: stopped })
    expect(countedOf([])).toEqual({ seconds: 0, endedAt: null })
  })

  it("starts at what the timer counted, ending to the second it stopped", () => {
    const draft = addTimeDraft({ seconds: 4, endedAt: stopped }, "UTC")
    expect(draft.took).toBe("00:04")
    expect(draft.when).toEqual({
      date: "2026-11-11",
      time: "08:40",
      exact: stopped,
    })
    expect(endOf(draft.when, "UTC", now)).toBe(stopped)
  })

  it("starts empty with nothing counted, not at the planned countdowns", () => {
    expect(addTimeDraft({ seconds: 0, endedAt: null }, "UTC")).toEqual({
      took: "00:00",
      when: null,
    })
  })
})

describe("waiting timer time", () => {
  it("is what done activities under this one still hold from the timer", () => {
    const run = {
      entries: [
        {
          id: "e0",
          activityId: "smoke",
          start: 100,
          end: 130,
          manual: false as const,
          recording: "pending" as const,
        },
        {
          id: "e1",
          activityId: "perf",
          start: 130,
          end: 190,
          manual: false as const,
          recording: "pending" as const,
        },
      ],
      cursor: null,
      passed: [],
      done: ["smoke"],
      canceled: [],
      replay: [],
      scopeId: null,
      runStart: 0,
      attemptFrom: {},
      joinedAt: {},
      started: true,
    }
    expect(waitingOf(release, run)).toEqual({
      seconds: 30,
      endedAt: parseUtc("1970-01-01T00:02:10.000Z"),
    })
    expect(waitingOf(solo, run).seconds).toBe(0)
    // Canceling a group drops nothing, so a done step under it still holds its time, as
    // saving added time on it replaces.
    expect(waitingOf(release, { ...run, canceled: ["checks"] }).seconds).toBe(
      30
    )
  })
})

describe("the Add time offer", () => {
  const earlier = { seconds: 300, endedAt: at("08:30:00") }
  const skipped = {
    counted: earlier,
    from: "status" as const,
    open: false,
    actions: 2,
  }

  it("opened by hand, keeps this visit's count while nothing happened on the timer", () => {
    expect(offerShown(skipped, "timer", undefined, 2)).toEqual({
      counted: earlier,
      from: "timer",
      open: true,
      actions: 2,
    })
    expect(offerShown(skipped, "timer", undefined, 3).counted).toBeNull()
    expect(offerShown(null, "timer", undefined, 0).counted).toBeNull()
  })

  it("after a Done that dropped nothing, drops an earlier Done's count", () => {
    expect(offerShown(skipped, "status", null, 2).counted).toBeNull()
    const fresh = { seconds: 4, endedAt: at("08:40:04") }
    expect(offerShown(skipped, "status", fresh, 2).counted).toEqual(fresh)
  })
})

describe("logPlan", () => {
  it("saves one total on the activity, ending just now", () => {
    expect(logPlan(release, draft, "UTC", now)).toEqual({
      sessions: [
        {
          activityId: "release",
          startedAt: at("08:35:00"),
          endedAt: at("09:00:00"),
        },
      ],
    })
  })

  it("reads Ended in the workspace timezone", () => {
    expect(
      logPlan(
        release,
        { took: "1:00:00", when: { date: "2026-11-10", time: "19:30" } },
        "Australia/Sydney",
        now
      )
    ).toEqual({
      sessions: [
        {
          activityId: "release",
          startedAt: parseUtc("2026-11-10T07:30:00.000Z"),
          endedAt: parseUtc("2026-11-10T08:30:00.000Z"),
        },
      ],
    })
  })

  it("saves more than a day as back-to-back sessions of at most a day", () => {
    expect(logPlan(solo, { ...draft, took: "26:00:00" }, "UTC", now)).toEqual({
      sessions: [
        {
          activityId: "solo",
          startedAt: parseUtc("2026-11-10T07:00:00.000Z"),
          endedAt: parseUtc("2026-11-10T09:00:00.000Z"),
        },
        {
          activityId: "solo",
          startedAt: parseUtc("2026-11-10T09:00:00.000Z"),
          endedAt: now,
        },
      ],
    })
  })

  it("asks for a duration when nothing was typed", () => {
    expect(logPlan(release, { ...draft, took: "00:00" }, "UTC", now)).toEqual({
      error: "Type how long it took.",
    })
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
