import { describe, expect, it } from "vitest"
import {
  repeatCount,
  repeatLabel,
  seriesSteps,
  stepStatus,
  timerFrom,
  type Gap,
} from "./series"

const noGap: Gap = {
  title: "",
  duration: "00:00",
  typeId: null,
  typeName: null,
}

const round = { mode: "down" as const, seconds: 90, sound: "none" as const }

describe("repeatCount", () => {
  it("reads what was typed, between 1 and 50", () => {
    expect(repeatCount("4")).toBe(4)
    expect(repeatCount("")).toBe(1)
    expect(repeatCount("0")).toBe(1)
    expect(repeatCount("120")).toBe(50)
  })
})

describe("timerFrom", () => {
  it("counts down from a duration and up from 00:00", () => {
    expect(timerFrom("07:30", "bell")).toEqual({
      mode: "down",
      seconds: 450,
      sound: "bell",
    })
    expect(timerFrom("00:00", "bell")).toEqual({ mode: "up", sound: "bell" })
  })
})

describe("seriesSteps", () => {
  it("makes one plain activity when it doesn't repeat", () => {
    expect(
      seriesSteps({
        title: "Release notes",
        timer: null,
        typeId: "project",
        repeat: 1,
        gap: noGap,
        sound: "none",
      })
    ).toEqual([
      {
        title: "Release notes",
        timer: null,
        typeId: "project",
        generated: null,
      },
    ])
  })

  it("numbers the repeats and puts the gap only between them", () => {
    const steps = seriesSteps({
      title: "Scales",
      timer: round,
      typeId: "practice",
      repeat: 3,
      gap: {
        title: "Rest",
        duration: "00:30",
        typeId: "rest",
        typeName: "Rest",
      },
      sound: "chime",
    })
    expect(steps.map((step) => [step.title, step.generated])).toEqual([
      ["Scales 1", "step"],
      ["Rest", "gap"],
      ["Scales 2", "step"],
      ["Rest", "gap"],
      ["Scales 3", "step"],
    ])
    expect(steps[1]).toMatchObject({
      typeId: "rest",
      timer: { mode: "down", seconds: 30, sound: "chime" },
    })
    expect(steps[0]).toMatchObject({ typeId: "practice", timer: round })
  })

  it("repeats back to back without a gap", () => {
    const steps = seriesSteps({
      title: "Smoke test",
      timer: null,
      typeId: null,
      repeat: 2,
      gap: noGap,
      sound: "none",
    })
    expect(steps.map((step) => step.title)).toEqual([
      "Smoke test 1",
      "Smoke test 2",
    ])
  })

  it("names an untitled gap after its type, then its time, and keeps the type's timer at 00:00", () => {
    const typed = seriesSteps({
      title: "Changes",
      timer: null,
      typeId: null,
      repeat: 2,
      gap: {
        title: " ",
        duration: "01:00",
        typeId: "rest",
        typeName: "Breather",
      },
      sound: "none",
    })
    expect(typed[1]?.title).toBe("Breather")
    const timed = seriesSteps({
      title: "Changes",
      timer: null,
      typeId: null,
      repeat: 2,
      gap: { ...noGap, duration: "01:00" },
      sound: "none",
    })
    expect(timed[1]?.title).toBe("1:00")
    const named = seriesSteps({
      title: "Changes",
      timer: null,
      typeId: null,
      repeat: 2,
      gap: { ...noGap, title: "Stretch" },
      sound: "none",
    })
    expect(named[1]).toMatchObject({ title: "Stretch", timer: null })
  })

  it("puts a gap of the chosen type between repeats with no name or time", () => {
    const steps = seriesSteps({
      title: "Review",
      timer: null,
      typeId: null,
      repeat: 2,
      gap: { ...noGap, typeId: "break", typeName: "Break" },
      sound: "none",
    })
    expect(steps.map((step) => [step.title, step.generated])).toEqual([
      ["Review 1", "step"],
      ["Break", "gap"],
      ["Review 2", "step"],
    ])
    expect(steps[1]).toMatchObject({ typeId: "break", timer: null })
    expect(
      repeatLabel(2, { ...noGap, typeId: "break", typeName: "Break" })
    ).toBe("×2 · Break")
  })
})

describe("stepStatus", () => {
  const steps = seriesSteps({
    title: "Scales",
    timer: null,
    typeId: null,
    repeat: 2,
    gap: { ...noGap, title: "Breathe" },
    sound: "none",
  })

  it("makes the gaps done too when the series is created done", () => {
    expect(steps.map((step) => stepStatus(step, "done"))).toEqual([
      "done",
      "done",
      "done",
    ])
  })

  it("leaves the gaps to do otherwise", () => {
    expect(steps.map((step) => stepStatus(step, "progress"))).toEqual([
      "progress",
      "todo",
      "progress",
    ])
  })
})

describe("repeatLabel", () => {
  it("says how many and what goes between", () => {
    expect(repeatLabel(1, noGap)).toBe("Repeat")
    expect(repeatLabel(4, noGap)).toBe("×4")
    expect(repeatLabel(4, { ...noGap, title: "Rest", duration: "01:00" })).toBe(
      "×4 · Rest 1:00"
    )
  })
})
