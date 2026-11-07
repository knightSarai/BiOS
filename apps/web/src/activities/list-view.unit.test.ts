import { describe, expect, it } from "vitest"
import { parseUtc } from "@knight-os/server/core"
import { dateGroupOf, isListed, listDay, listOrder } from "./list-view"

const today = "2026-11-08"

const activity = (
  overrides: Partial<{
    status: "todo" | "done" | "backlog"
    dueDate: string | null
    createdAt: string
    updatedAt: string
  }> = {}
) => ({
  status: overrides.status ?? "todo",
  dueDate: overrides.dueDate ?? null,
  createdAt: parseUtc(overrides.createdAt ?? "2026-11-01T10:00:00.000Z"),
  updatedAt: parseUtc(overrides.updatedAt ?? "2026-11-01T10:00:00.000Z"),
})

describe("dateGroupOf", () => {
  it("plans by due date", () => {
    const group = (day: string | null) => dateGroupOf(day, "due", today)
    expect(group("2026-11-07")).toBe("overdue")
    expect(group("2026-11-08")).toBe("today")
    expect(group("2026-11-09")).toBe("tomorrow")
    expect(group("2026-11-15")).toBe("next-7-days")
    expect(group("2026-11-16")).toBe("later")
    expect(group(null)).toBe("no-date")
  })

  it("looks back for created and updated", () => {
    const group = (day: string) => dateGroupOf(day, "updated", today)
    expect(group("2026-11-08")).toBe("today")
    expect(group("2026-11-07")).toBe("yesterday")
    expect(group("2026-11-02")).toBe("last-7-days")
    expect(group("2026-11-01")).toBe("this-month")
    expect(group("2026-10-31")).toBe("earlier")
  })

  it("keeps the last 7 days whole across the start of a month", () => {
    expect(dateGroupOf("2026-10-28", "created", "2026-11-02")).toBe(
      "last-7-days"
    )
  })
})

describe("listDay", () => {
  it("reads created and updated in the workspace's timezone", () => {
    const late = activity({ createdAt: "2026-11-07T23:30:00.000Z" })
    expect(listDay(late, "created", "UTC")).toBe("2026-11-07")
    expect(listDay(late, "created", "Australia/Sydney")).toBe("2026-11-08")
  })

  it("uses the due date as it is", () => {
    expect(listDay(activity({ dueDate: "2026-11-10" }), "due", "UTC")).toBe(
      "2026-11-10"
    )
  })
})

describe("isListed", () => {
  it("shows only open activities unless all statuses are on", () => {
    expect(isListed(activity({ status: "backlog" }), "open")).toBe(true)
    expect(isListed(activity({ status: "done" }), "open")).toBe(false)
    expect(isListed(activity({ status: "done" }), "all")).toBe(true)
  })
})

describe("listOrder", () => {
  it("puts the soonest due first and undated last", () => {
    const rows = [
      activity({ dueDate: null }),
      activity({ dueDate: "2026-11-12" }),
      activity({ dueDate: "2026-11-09" }),
    ]
    expect(rows.toSorted(listOrder("due")).map((row) => row.dueDate)).toEqual([
      "2026-11-09",
      "2026-11-12",
      null,
    ])
  })

  it("puts the most recently updated first", () => {
    const older = activity({ updatedAt: "2026-11-01T10:00:00.000Z" })
    const newer = activity({ updatedAt: "2026-11-05T10:00:00.000Z" })
    expect([older, newer].toSorted(listOrder("updated"))).toEqual([
      newer,
      older,
    ])
  })
})
