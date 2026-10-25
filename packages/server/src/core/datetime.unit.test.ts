import { describe, expect, it } from "vitest"
import {
  addCivilDays,
  composeDateFormatPattern,
  endOfDayUtc,
  formatActivityTimestamp,
  formatWorkspaceDate,
  formatCivilDate,
  formatDate,
  isCivilDate,
  parseCivilDate,
  oneMillisecondAfter,
  oneMillisecondBefore,
  parseUtc,
  sameInstant,
  startOfDayUtc,
  toCivilDate,
  toLocalDate,
  utcPlusSeconds,
} from "#core/datetime"

describe("parseUtc", () => {
  describe("accepts and canonicalizes valid input", () => {
    it("returns canonical ISO for canonical UTC string", () => {
      expect(parseUtc("2026-05-03T22:30:00.000Z")).toBe(
        "2026-05-03T22:30:00.000Z"
      )
    })

    it("pads milliseconds when input has Z but no fractional seconds", () => {
      expect(parseUtc("2026-05-03T22:30:00Z")).toBe("2026-05-03T22:30:00.000Z")
    })

    it("accepts 1- or 2-digit milliseconds", () => {
      expect(parseUtc("2026-05-03T22:30:00.5Z")).toBe(
        "2026-05-03T22:30:00.500Z"
      )
      expect(parseUtc("2026-05-03T22:30:00.05Z")).toBe(
        "2026-05-03T22:30:00.050Z"
      )
    })

    it("canonicalizes +00:00 offset to Z", () => {
      expect(parseUtc("2026-05-03T22:30:00+00:00")).toBe(
        "2026-05-03T22:30:00.000Z"
      )
      expect(parseUtc("2026-05-03T22:30:00.000+00:00")).toBe(
        "2026-05-03T22:30:00.000Z"
      )
    })

    it("accepts a valid Date object via toISOString", () => {
      const d = new Date("2026-05-03T22:30:00.000Z")
      expect(parseUtc(d)).toBe("2026-05-03T22:30:00.000Z")
    })
  })

  describe("rejects ambiguous or non-UTC input", () => {
    it("rejects a naive datetime string with no timezone marker", () => {
      expect(() => parseUtc("2026-05-03T22:30:00")).toThrow(TypeError)
    })

    it("rejects ISO strings with non-zero offsets", () => {
      expect(() => parseUtc("2026-05-03T22:30:00+10:00")).toThrow(TypeError)
      expect(() => parseUtc("2026-05-03T22:30:00-05:00")).toThrow(TypeError)
    })

    it("rejects date-only strings", () => {
      expect(() => parseUtc("2026-05-03")).toThrow(TypeError)
    })

    it("rejects space-separated datetime", () => {
      expect(() => parseUtc("2026-05-03 22:30:00Z")).toThrow(TypeError)
    })

    it("rejects garbage strings", () => {
      expect(() => parseUtc("not a date")).toThrow(TypeError)
      expect(() => parseUtc("")).toThrow(TypeError)
    })

    it("rejects shape-valid but semantically invalid dates", () => {
      expect(() => parseUtc("2026-13-99T99:99:99Z")).toThrow(TypeError)
    })

    it("rejects rollover dates without silently shifting the instant", () => {
      expect(() => parseUtc("2026-02-31T22:30:00Z")).toThrow(TypeError)
      expect(() => parseUtc("2026-05-03T24:00:00Z")).toThrow(TypeError)
      expect(() => parseUtc("2026-13-01T00:00:00Z")).toThrow(TypeError)
      expect(() => parseUtc("2026-04-31T00:00:00Z")).toThrow(TypeError)
    })
  })

  describe("rejects invalid Date and non-string/non-Date input", () => {
    it("rejects an Invalid Date object", () => {
      expect(() => parseUtc(new Date("not a date"))).toThrow(TypeError)
    })

    it("rejects null, undefined, and other non-string/non-Date values", () => {
      expect(() => parseUtc(null as unknown as string)).toThrow(TypeError)
      expect(() => parseUtc(undefined as unknown as string)).toThrow(TypeError)
      expect(() => parseUtc(0 as unknown as string)).toThrow(TypeError)
      expect(() => parseUtc({} as unknown as string)).toThrow(TypeError)
    })
  })
})

describe("utcPlusSeconds", () => {
  it("returns a canonical UtcDatetime the given number of seconds ahead", () => {
    const before = Date.now()
    const result = utcPlusSeconds(300)
    const after = Date.now()

    expect(parseUtc(result)).toBe(result)
    expect(new Date(result).getTime()).toBeGreaterThanOrEqual(before + 300_000)
    expect(new Date(result).getTime()).toBeLessThanOrEqual(after + 300_000)
  })
})

describe("composeDateFormatPattern", () => {
  it("orders parts correctly per order", () => {
    expect(composeDateFormatPattern("DMY", "-")).toBe("DD-MM-YYYY")
    expect(composeDateFormatPattern("MDY", "-")).toBe("MM-DD-YYYY")
    expect(composeDateFormatPattern("YMD", "-")).toBe("YYYY-MM-DD")
  })
})

describe("formatDate", () => {
  describe("renders each order × separator combination", () => {
    const instant = parseUtc("2026-05-03T22:30:00.000Z")

    it("renders YMD with dash (default)", () => {
      expect(formatDate(instant, "UTC")).toBe("2026-05-03")
    })
    it("renders DMY with dash", () => {
      expect(formatDate(instant, "UTC", { order: "DMY", separator: "-" })).toBe(
        "03-05-2026",
      )
    })
    it("renders MDY with dash", () => {
      expect(formatDate(instant, "UTC", { order: "MDY", separator: "-" })).toBe(
        "05-03-2026",
      )
    })
    it("renders YMD with slash", () => {
      expect(formatDate(instant, "UTC", { order: "YMD", separator: "/" })).toBe(
        "2026/05/03",
      )
    })
    it("renders DMY with slash", () => {
      expect(formatDate(instant, "UTC", { order: "DMY", separator: "/" })).toBe(
        "03/05/2026",
      )
    })
    it("renders MDY with slash", () => {
      expect(formatDate(instant, "UTC", { order: "MDY", separator: "/" })).toBe(
        "05/03/2026",
      )
    })
    it("renders DMY with dot", () => {
      expect(formatDate(instant, "UTC", { order: "DMY", separator: "." })).toBe(
        "03.05.2026",
      )
    })
  })

  describe("shifts the calendar date according to the timezone", () => {
    it("renders the UTC calendar date when tz is 'UTC'", () => {
      const instant = parseUtc("2026-05-03T22:30:00.000Z")
      expect(formatDate(instant, "UTC")).toBe("2026-05-03")
    })

    it("crosses to the next day in Brisbane for late-evening UTC", () => {
      const instant = parseUtc("2026-05-03T22:30:00.000Z")
      expect(
        formatDate(instant, "Australia/Brisbane", {
          order: "DMY",
          separator: "/",
        }),
      ).toBe("04/05/2026")
    })

    it("stays on the same UTC day in Brisbane for early-UTC instants", () => {
      const instant = parseUtc("2026-05-03T06:00:00.000Z")
      expect(
        formatDate(instant, "Australia/Brisbane", {
          order: "DMY",
          separator: "/",
        }),
      ).toBe("03/05/2026")
    })

    it("renders different calendar dates in Brisbane and Auckland for the same instant", () => {
      const instant = parseUtc("2026-05-03T13:00:00.000Z")
      expect(formatDate(instant, "Australia/Brisbane")).toBe("2026-05-03")
      expect(formatDate(instant, "Pacific/Auckland")).toBe("2026-05-04")
    })
  })

  describe("respects DST when shifting the calendar date", () => {
    it("uses NZDT (UTC+13) for Auckland in January", () => {
      const instant = parseUtc("2026-01-15T11:00:00.000Z")
      expect(formatDate(instant, "Pacific/Auckland")).toBe("2026-01-16")
    })

    it("uses NZST (UTC+12) for Auckland in July", () => {
      const instant = parseUtc("2026-07-15T11:00:00.000Z")
      expect(formatDate(instant, "Pacific/Auckland")).toBe("2026-07-15")
    })

    it("Brisbane has no DST so its offset is constant year-round", () => {
      const jan = parseUtc("2026-01-15T14:00:00.000Z")
      const jul = parseUtc("2026-07-15T14:00:00.000Z")
      expect(formatDate(jan, "Australia/Brisbane")).toBe("2026-01-16")
      expect(formatDate(jul, "Australia/Brisbane")).toBe("2026-07-16")
    })
  })

  describe("rejects invalid runtime input", () => {
    it("throws on an unknown IANA timezone", () => {
      const instant = parseUtc("2026-05-03T22:30:00.000Z")
      expect(() =>
        formatDate(instant, "Pacific/Aucklandd", {
          order: "DMY",
          separator: "/",
        }),
      ).toThrow()
    })
  })
})

describe("startOfDayUtc", () => {
  it.each([
    ["2026-07-15", "2026-07-14T14:00:00.000Z"],
    ["2026-01-15", "2026-01-14T13:00:00.000Z"],
    ["2026-10-04", "2026-10-03T14:00:00.000Z"],
    ["2026-10-05", "2026-10-04T13:00:00.000Z"],
    ["2026-04-05", "2026-04-04T13:00:00.000Z"],
    ["2026-04-06", "2026-04-05T14:00:00.000Z"],
  ])("resolves Sydney midnight for %s", (date, expected) => {
    const instant = startOfDayUtc(date, "Australia/Sydney")

    expect(instant.toISOString()).toBe(expected)
  })

  it("documents dayjs resolution when local midnight does not exist", () => {
    const instant = startOfDayUtc("2018-11-04", "America/Sao_Paulo")

    expect(instant.toISOString()).toBe("2018-11-04T03:00:00.000Z")
  })
})

describe("endOfDayUtc", () => {
  it.each([
    ["2026-07-15", "2026-07-15T13:59:59.999Z"],
    ["2026-01-15", "2026-01-15T12:59:59.999Z"],
    ["2026-10-03", "2026-10-03T13:59:59.999Z"],
    ["2026-10-04", "2026-10-04T12:59:59.999Z"],
    ["2026-04-04", "2026-04-04T12:59:59.999Z"],
    ["2026-04-05", "2026-04-05T13:59:59.999Z"],
  ])("resolves Sydney end of day for %s", (date, expected) => {
    const instant = endOfDayUtc(date, "Australia/Sydney")

    expect(instant.toISOString()).toBe(expected)
  })

  it("preserves 23:59:59.999 precision", () => {
    const instant = endOfDayUtc("2026-08-01", "Australia/Sydney")

    expect(instant.toISOString()).toBe("2026-08-01T13:59:59.999Z")
  })
})

describe("toLocalDate", () => {
  it("returns tomorrow in Sydney for a UTC instant before Sydney midnight", () => {
    const date = toLocalDate(
      new Date("2026-07-07T15:00:00.000Z"),
      "Australia/Sydney",
    )

    expect(date).toBe("2026-07-08")
  })

  it("round-trips a Sydney civil date boundary", () => {
    const instant = startOfDayUtc("2026-01-15", "Australia/Sydney")

    expect(toLocalDate(instant, "Australia/Sydney")).toBe("2026-01-15")
  })
})

describe("sameInstant", () => {
  it("compares at millisecond precision", () => {
    expect(
      sameInstant(
        new Date("2026-07-07T15:00:00.000Z"),
        new Date("2026-07-07T15:00:00.000Z"),
      ),
    ).toBe(true)
    expect(
      sameInstant(
        new Date("2026-07-07T15:00:00.000Z"),
        new Date("2026-07-07T15:00:00.001Z"),
      ),
    ).toBe(false)
  })
})

describe("oneMillisecondBefore / oneMillisecondAfter", () => {
  it("shifts an instant by exactly one millisecond", () => {
    const instant = new Date("2026-08-01T00:00:00.000Z")

    expect(oneMillisecondBefore(instant).toISOString()).toBe(
      "2026-07-31T23:59:59.999Z",
    )
    expect(oneMillisecondAfter(instant).toISOString()).toBe(
      "2026-08-01T00:00:00.001Z",
    )
  })
})

describe("isCivilDate", () => {
  it.each([
    ["a plain calendar date", "2026-08-01"],
    ["a leap-year Feb 29", "2028-02-29"],
  ])("accepts %s", (_caseName, value) => {
    expect(isCivilDate(value)).toBe(true)
  })

  it.each([
    ["a day that overflows the month", "2026-02-30"],
    ["Feb 29 outside a leap year", "2026-02-29"],
    ["a thirteenth month", "2026-13-01"],
    ["an unpadded date", "2026-8-1"],
    ["an ISO timestamp", "2026-08-01T00:00:00Z"],
    ["an empty string", ""],
  ])("rejects %s", (_caseName, value) => {
    expect(isCivilDate(value)).toBe(false)
  })
})

describe("parseCivilDate / toCivilDate", () => {
  it("parses a civil date as local midnight of that calendar day", () => {
    expect(parseCivilDate("2026-09-01")).toEqual(new Date(2026, 8, 1))
  })

  it.each(["2026-09-01", "2028-02-29", "2026-12-31"])(
    "round-trips %s through a Date without shifting the day",
    (value) => {
      expect(toCivilDate(parseCivilDate(value))).toBe(value)
    },
  )
})

describe("addCivilDays", () => {
  it.each([
    ["2026-09-01", 1, "2026-09-02"],
    ["2026-08-31", 1, "2026-09-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-02-28", 1, "2026-03-01"],
    ["2026-09-01", -1, "2026-08-31"],
    ["2026-09-01", 0, "2026-09-01"],
  ])("%s + %i day(s) = %s", (value, days, expected) => {
    expect(addCivilDays(value, days)).toBe(expected)
  })
})

describe("formatCivilDate", () => {
  it("defaults to YMD with dashes", () => {
    expect(formatCivilDate("2026-09-01")).toBe("2026-09-01")
  })

  it.each([
    ["DMY", "/", "01/09/2026"],
    ["MDY", "/", "09/01/2026"],
    ["YMD", "/", "2026/09/01"],
    ["DMY", ".", "01.09.2026"],
    ["DMY", "-", "01-09-2026"],
  ] as const)("renders %s with %s as %s", (order, separator, expected) => {
    expect(formatCivilDate("2026-09-01", { order, separator })).toBe(expected)
  })
})

describe("formatActivityTimestamp", () => {
  const timezone = "Australia/Brisbane"
  const now = parseUtc("2026-09-15T02:30:00.000Z")

  it("labels an instant on the same local day as Today", () => {
    expect(
      formatActivityTimestamp(
        parseUtc("2026-09-14T23:42:00.000Z"),
        timezone,
        now,
      ),
    ).toBe("Today · 09:42")
  })

  it("labels an instant on the previous local day as Yesterday", () => {
    expect(
      formatActivityTimestamp(
        parseUtc("2026-09-13T23:04:00.000Z"),
        timezone,
        now,
      ),
    ).toBe("Yesterday · 09:04")
  })

  it("renders day and month for an earlier day in the same local year", () => {
    expect(
      formatActivityTimestamp(
        parseUtc("2026-03-18T01:04:00.000Z"),
        timezone,
        now,
      ),
    ).toBe("18 Mar · 11:04")
  })

  it("includes the year when the local year differs from now", () => {
    expect(
      formatActivityTimestamp(
        parseUtc("2025-03-03T23:36:00.000Z"),
        timezone,
        now,
      ),
    ).toBe("4 Mar 2025 · 09:36")
  })

  it.each([
    ["UTC", "Yesterday · 22:00"],
    [timezone, "Today · 08:00"],
  ])("labels an instant by its %s calendar day as %s", (zone, expected) => {
    expect(
      formatActivityTimestamp(
        parseUtc("2026-09-14T22:00:00.000Z"),
        zone,
        now,
      ),
    ).toBe(expected)
  })
})

describe("formatWorkspaceDate", () => {
  it("renders the instant in the workspace timezone with its date order and separator", () => {
    const result = formatWorkspaceDate("2026-05-03T22:30:00.000Z", {
      timezone: "Australia/Brisbane",
      dateOrder: "DMY",
      dateSeparator: "/",
    })

    expect(result).toBe("04/05/2026")
  })
})
