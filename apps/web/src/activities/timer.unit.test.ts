import { describe, expect, it } from "vitest"
import { parseUtc } from "@knight-os/server/core"
import {
  DEFAULT_TIMER,
  InvalidTimerError,
  elapsedSeconds,
  finishTimeFor,
  formatClock,
  parseClock,
  parseTimerConfig,
  resolveTimer,
  stopTimeFor,
  timerLaps,
  timerState,
  timerTotalSeconds,
  upcomingCues,
  withMode,
  type TimerConfig,
} from "./timer"

const boxing: TimerConfig = {
  mode: "intervals",
  workSeconds: 180,
  restSeconds: 60,
  rounds: 3,
  sound: "bell",
}

const at = (time: string) => parseUtc(`2026-11-07T${time}.000Z`)

describe("resolveTimer", () => {
  it("prefers the activity's timer, then the type's, then a silent stopwatch", () => {
    const countdown: TimerConfig = {
      mode: "countdown",
      seconds: 60,
      sound: "beep",
    }
    expect(resolveTimer(countdown, boxing)).toBe(countdown)
    expect(resolveTimer(null, boxing)).toBe(boxing)
    expect(resolveTimer(null, null)).toEqual(DEFAULT_TIMER)
  })
})

describe("parseTimerConfig", () => {
  it("rejects zero-length work and a negative rest", () => {
    expect(() => parseTimerConfig({ ...boxing, workSeconds: 0 })).toThrow(
      InvalidTimerError
    )
    expect(() => parseTimerConfig({ ...boxing, restSeconds: -1 })).toThrow(
      InvalidTimerError
    )
    expect(() =>
      parseTimerConfig({ ...boxing, workSeconds: 3600, rounds: 25 })
    ).toThrow(InvalidTimerError)
    expect(parseTimerConfig({ ...boxing, restSeconds: 0 })).toMatchObject({
      restSeconds: 0,
    })
  })
})

describe("withMode", () => {
  it("keeps the sound and fills in starting durations", () => {
    expect(withMode(boxing, "countdown")).toEqual({
      mode: "countdown",
      seconds: 600,
      sound: "bell",
    })
    expect(withMode(boxing, "intervals")).toBe(boxing)
  })
})

describe("timerTotalSeconds", () => {
  it("leaves out the rest after the last round", () => {
    expect(timerTotalSeconds(boxing)).toBe(3 * 180 + 2 * 60)
    expect(timerTotalSeconds(DEFAULT_TIMER)).toBeNull()
  })
})

describe("timerState", () => {
  it.each([
    [0, { kind: "work", round: 1, remaining: 180 }],
    [179.5, { kind: "work", round: 1, remaining: 0.5 }],
    [180, { kind: "rest", round: 1, remaining: 60 }],
    [240, { kind: "work", round: 2, remaining: 180 }],
    [659, { kind: "work", round: 3, remaining: 1 }],
  ])("at %ss into a 3 × 3:00 / 1:00 timer", (elapsed, expected) => {
    expect(timerState(boxing, elapsed)).toMatchObject(expected)
  })

  it("finishes when the last round ends", () => {
    expect(timerState(boxing, 660)).toEqual({ kind: "finished", rounds: 3 })
  })

  it("counts a countdown down to zero and no further", () => {
    const countdown: TimerConfig = {
      mode: "countdown",
      seconds: 90,
      sound: "none",
    }
    expect(timerState(countdown, 30)).toMatchObject({
      remaining: 60,
      finished: false,
    })
    expect(timerState(countdown, 120)).toMatchObject({
      remaining: 0,
      finished: true,
    })
  })
})

describe("upcomingCues", () => {
  it("rings each round in, rest in, and the finish, from the start", () => {
    expect(upcomingCues(boxing, 0)).toEqual([
      { atSecond: 0, cue: "work" },
      { atSecond: 180, cue: "rest" },
      { atSecond: 240, cue: "work" },
      { atSecond: 420, cue: "rest" },
      { atSecond: 480, cue: "work" },
      { atSecond: 660, cue: "finish" },
    ])
  })

  it("skips cues already passed when resuming", () => {
    expect(upcomingCues(boxing, 200).map((cue) => cue.atSecond)).toEqual([
      240, 420, 480, 660,
    ])
  })

  it("has no rest cue when rest is zero", () => {
    const noRest: TimerConfig = { ...boxing, restSeconds: 0, rounds: 2 }
    expect(upcomingCues(noRest, 0)).toEqual([
      { atSecond: 0, cue: "work" },
      { atSecond: 180, cue: "work" },
      { atSecond: 360, cue: "finish" },
    ])
  })

  it("never rings for a stopwatch", () => {
    expect(upcomingCues(DEFAULT_TIMER, 0)).toEqual([])
  })
})

describe("elapsedSeconds", () => {
  const entries = [
    { startedAt: at("10:00:00"), endedAt: at("10:01:00") },
    { startedAt: at("10:05:00"), endedAt: null },
  ]

  it("adds closed entries and the running one up to now", () => {
    expect(elapsedSeconds(entries, at("10:05:30"))).toBe(90)
  })

  it("leaves the running entry out without a current time", () => {
    expect(elapsedSeconds(entries, null)).toBe(60)
  })
})

describe("timerLaps", () => {
  it("measures each lap from the last one, leaving pauses out", () => {
    const entries = [
      { startedAt: at("10:00:00"), endedAt: at("10:04:00"), endsLap: true },
      { startedAt: at("10:04:00"), endedAt: at("10:05:00"), endsLap: false },
      { startedAt: at("10:10:00"), endedAt: at("10:12:30"), endsLap: true },
      { startedAt: at("10:12:30"), endedAt: null, endsLap: false },
    ]
    expect(timerLaps(entries)).toEqual([
      { number: 1, seconds: 240, total: 240 },
      { number: 2, seconds: 210, total: 450 },
    ])
  })

  it("has no laps until one is recorded", () => {
    const entries = [
      { startedAt: at("10:00:00"), endedAt: at("10:04:00"), endsLap: false },
    ]
    expect(timerLaps(entries)).toEqual([])
  })
})

describe("stopTimeFor", () => {
  it("stops a forgotten interval timer where it finished", () => {
    const entries = [{ startedAt: at("10:00:00"), endedAt: null }]
    expect(stopTimeFor(boxing, entries, at("10:30:00"))).toBe(at("10:11:00"))
  })

  it("stops a stopwatch at the current time", () => {
    const entries = [{ startedAt: at("10:00:00"), endedAt: null }]
    expect(stopTimeFor(DEFAULT_TIMER, entries, at("10:30:00"))).toBe(
      at("10:30:00")
    )
  })
})

describe("finishTimeFor", () => {
  it("ends the running entry exactly where the total is reached", () => {
    const entries = [
      { startedAt: at("10:00:00"), endedAt: at("10:05:00") },
      { startedAt: at("10:20:00"), endedAt: null },
    ]
    expect(finishTimeFor(boxing, entries)).toBe(at("10:26:00"))
    expect(finishTimeFor(DEFAULT_TIMER, entries)).toBeNull()
  })
})

describe("clock text", () => {
  it.each([
    ["90", 90],
    ["1:30", 90],
    ["1:02:03", 3723],
    ["0:00", 0],
    ["1:3a", null],
    ["", null],
    ["1:2:3:4", null],
  ])("parses %j as %j", (input, seconds) => {
    expect(parseClock(input)).toBe(seconds)
  })

  it("rounds countdowns up and stopwatches down", () => {
    expect(formatClock(59.2, "up")).toBe("1:00")
    expect(formatClock(59.8, "down")).toBe("0:59")
    expect(formatClock(3723, "down")).toBe("1:02:03")
    expect(formatClock(-3, "up")).toBe("0:00")
  })
})
