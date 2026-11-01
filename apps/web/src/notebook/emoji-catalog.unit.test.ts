import { describe, expect, it } from "vitest"
import { EMOJI_CATEGORIES, searchEmoji } from "./emoji-catalog"

describe("searchEmoji", () => {
  it("finds emoji by any word in their name", () => {
    expect(searchEmoji("box").map((entry) => entry.emoji)).toEqual(["🥊"])
    expect(searchEmoji("  CALENDAR ").map((entry) => entry.emoji)).toEqual([
      "📅",
      "🗓️",
    ])
  })

  it("returns each emoji once even when it sits in two categories", () => {
    expect(
      searchEmoji("pin").filter((entry) => entry.emoji === "📌")
    ).toHaveLength(1)
  })

  it("returns nothing for an empty search", () => {
    expect(searchEmoji("   ")).toEqual([])
  })

  it("has about two hundred emoji", () => {
    const count = EMOJI_CATEGORIES.reduce(
      (sum, group) => sum + group.emoji.length,
      0
    )
    expect(count).toBeGreaterThan(150)
  })
})
