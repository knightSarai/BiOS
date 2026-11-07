import { describe, expect, it } from "vitest"
import { dailyNoteLocation } from "./daily-note"

describe("daily note location", () => {
  it("files the note under Journal, Daily, year and month", () => {
    expect(
      dailyNoteLocation("2026-11-07", { dateOrder: "YMD", dateSeparator: "-" })
    ).toEqual({
      folders: ["Journal", "Daily", "2026", "Nov"],
      title: "2026-11-07",
    })
  })

  it("titles the note with the workspace date format", () => {
    expect(
      dailyNoteLocation("2026-01-04", { dateOrder: "DMY", dateSeparator: "/" })
        .title
    ).toBe("04/01/2026")
  })
})
