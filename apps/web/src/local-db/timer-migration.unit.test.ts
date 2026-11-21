import { describe, expect, it } from "vitest"
import { parseUtc } from "@knight-os/server/core"
import { lapGroups, stepsTotal, stoppedAt } from "./timer-migration"

const at = (time: string) => parseUtc(`2026-10-01T${time}.000Z`)

const entry = (
  id: string,
  start: string,
  end: string | null,
  endsLap = false
) => ({
  id,
  startedAt: at(start),
  endedAt: end === null ? null : at(end),
  endsLap,
})

describe("lapGroups", () => {
  it("keeps a paused lap after the last one open", () => {
    const groups = lapGroups([
      entry("e1", "10:00:00", "10:04:00", true),
      entry("e2", "10:04:00", "10:05:00"),
    ])
    expect(groups.map((group) => [group.title, group.ended])).toEqual([
      ["Lap 1", true],
      ["Lap 2", false],
    ])
  })
})

describe("stoppedAt", () => {
  const upgradedAt = at("23:00:00")

  it("ends a timer left running where it would have finished, less what was logged", () => {
    expect(stoppedAt(at("10:00:00"), 420, 180, upgradedAt)).toBe(at("10:04:00"))
  })

  it("never ends after the upgrade or before it started", () => {
    expect(stoppedAt(at("22:59:00"), 420, 0, upgradedAt)).toBe(upgradedAt)
    expect(stoppedAt(at("10:00:00"), 60, 600, upgradedAt)).toBe(at("10:00:00"))
  })

  it("ends a count-up at the upgrade, keeping the time it really ran", () => {
    expect(stoppedAt(at("10:00:00"), null, 0, upgradedAt)).toBe(upgradedAt)
    expect(stoppedAt(at("23:30:00"), null, 0, upgradedAt)).toBe(at("23:30:00"))
  })
})

describe("stepsTotal", () => {
  it("adds up countdowns, and can't with a count-up among them", () => {
    const down = (seconds: number) => ({
      mode: "down" as const,
      seconds,
      sound: "none" as const,
    })
    expect(stepsTotal([down(60), down(15), down(60)])).toBe(135)
    expect(stepsTotal([down(60), { mode: "up", sound: "none" }])).toBeNull()
    expect(stepsTotal([down(60), null])).toBeNull()
  })
})
