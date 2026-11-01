import { describe, expect, it } from "vitest"
import { ICON_CATEGORIES, searchIcons } from "./icon-catalog"
import { ICON_PATHS } from "./icon-paths.generated"
import {
  DEFAULT_DOCUMENT_ICON,
  hasCustomIcon,
  iconValue,
  parseStoredIcon,
} from "./stored-icon"

describe("parseStoredIcon", () => {
  it("reads a value without the prefix as an emoji", () => {
    expect(parseStoredIcon("🥊")).toEqual({ kind: "emoji", emoji: "🥊" })
  })

  it("reads the default document icon as the plain file icon", () => {
    expect(parseStoredIcon(DEFAULT_DOCUMENT_ICON)).toEqual({ kind: "file" })
    expect(hasCustomIcon(DEFAULT_DOCUMENT_ICON)).toBe(false)
    expect(hasCustomIcon(null)).toBe(false)
    expect(hasCustomIcon("🥊")).toBe(true)
  })

  it("round-trips an icon and its color", () => {
    expect(parseStoredIcon(iconValue("bone", "green"))).toEqual({
      kind: "icon",
      name: "bone",
      color: "green",
    })
  })

  it("falls back to the neutral color when the color is missing or unknown", () => {
    expect(parseStoredIcon("phosphor:bone")).toMatchObject({ color: "neutral" })
    expect(parseStoredIcon("phosphor:bone:mauve")).toMatchObject({
      color: "neutral",
    })
  })
})

describe("icon catalog", () => {
  it("gives every icon a unique kebab-case name", () => {
    const names = ICON_CATEGORIES.flatMap((group) =>
      group.icons.map((entry) => entry.name)
    )
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it("has about three hundred icons", () => {
    const count = ICON_CATEGORIES.reduce(
      (sum, group) => sum + group.icons.length,
      0
    )
    expect(count).toBeGreaterThan(280)
  })

  it("has generated paths for exactly the catalog icons", () => {
    const names = ICON_CATEGORIES.flatMap((group) =>
      group.icons.map((entry) => entry.name)
    )
    expect([...ICON_PATHS.keys()].sort()).toEqual([...names].sort())
  })

  it("searches by name and keywords", () => {
    expect(searchIcons(" MOSQUE ").map((entry) => entry.name)).toEqual([
      "mosque",
    ])
    expect(searchIcons("users").map((entry) => entry.name)).toEqual([
      "users-three",
    ])
    expect(searchIcons("  ")).toEqual([])
  })
})
