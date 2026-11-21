import { describe, expect, it } from "vitest"
import {
  DEFAULT_TIMER,
  InvalidTimerError,
  formatClock,
  parseClock,
  parseTimerConfig,
  resolveTimer,
  withMode,
  type TimerConfig,
} from "./timer"

const round: TimerConfig = { mode: "down", seconds: 180, sound: "bell" }

describe("resolveTimer", () => {
  it("prefers the activity's timer, then the type's, then a silent count-up", () => {
    const short: TimerConfig = { mode: "down", seconds: 60, sound: "beep" }
    expect(resolveTimer(short, round)).toBe(short)
    expect(resolveTimer(null, round)).toBe(round)
    expect(resolveTimer(null, null)).toEqual(DEFAULT_TIMER)
  })
})

describe("parseTimerConfig", () => {
  it("rejects an empty or day-long countdown and the old modes", () => {
    expect(() => parseTimerConfig({ ...round, seconds: 0 })).toThrow(
      InvalidTimerError
    )
    expect(() => parseTimerConfig({ ...round, seconds: 86401 })).toThrow(
      InvalidTimerError
    )
    expect(() =>
      parseTimerConfig({ mode: "stopwatch", sound: "none" })
    ).toThrow(InvalidTimerError)
    expect(parseTimerConfig({ mode: "up", sound: "none" })).toEqual(
      DEFAULT_TIMER
    )
  })
})

describe("withMode", () => {
  it("keeps the sound and starts a countdown at ten minutes", () => {
    expect(withMode({ mode: "up", sound: "bell" }, "down")).toEqual({
      mode: "down",
      seconds: 600,
      sound: "bell",
    })
    expect(withMode(round, "up")).toEqual({ mode: "up", sound: "bell" })
    expect(withMode(round, "down")).toBe(round)
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
