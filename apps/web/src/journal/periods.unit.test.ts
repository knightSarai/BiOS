import { describe, expect, it } from "vitest"
import {
  journalFolderPath,
  journalKeyOf,
  journalRefFor,
  journalTitle,
} from "./periods"

describe("journal periods", () => {
  it("files a day under its year and month", () => {
    const ref = journalRefFor("day", "2026-11-01")
    expect(ref).toEqual({
      period: "day",
      key: "2026-11-01",
      date: "2026-11-01",
    })
    expect(journalTitle(ref)).toBe("Sun 1 Nov")
    expect(journalFolderPath(ref).map((folder) => folder.name)).toEqual([
      "Journal",
      "2026",
      "November",
    ])
  })

  it("files a week under Weeks in the year holding its Thursday", () => {
    const ref = journalRefFor("week", "2027-01-02")
    expect(ref).toEqual({ period: "week", key: "2026-W53", date: "2026-12-28" })
    expect(journalTitle(ref)).toBe("Week 53 · 28 Dec – 3 Jan")
    expect(journalFolderPath(ref)).toEqual([
      { role: "journal", period: "", name: "Journal" },
      { role: "journal-year", period: "2026", name: "2026" },
      { role: "journal-weeks", period: "2026", name: "Weeks" },
    ])
  })

  it("titles the year page", () => {
    const ref = journalRefFor("year", "2026-11-01")
    expect(journalTitle(ref)).toBe("Year 2026")
    expect(journalKeyOf(ref)).toBe("year:2026")
  })
})
