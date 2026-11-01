import { describe, expect, it } from "vitest"
import { formatTargetMonth, isTargetMonth, monthsOfYear } from "./target-month"

describe("target month", () => {
  it("lists the twelve months of a year as target values", () => {
    const months = monthsOfYear(2027)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ value: "2027-01", label: "Jan" })
    expect(months[11]).toEqual({ value: "2027-12", label: "Dec" })
    expect(months.every((month) => isTargetMonth(month.value))).toBe(true)
  })

  it("formats a target month for display", () => {
    expect(formatTargetMonth("2027-03")).toBe("Mar 2027")
  })
})
