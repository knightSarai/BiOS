import { describe, expect, it } from "vitest"
import { isValidWorkspaceSlug, toSlug } from "#utils"

describe("toSlug", () => {
  it("lowercases and hyphenates words", () => {
    expect(toSlug("Knight Life")).toBe("knight-life")
  })

  it("trims leading and trailing separators", () => {
    expect(toSlug("  !!Hello World!! ")).toBe("hello-world")
  })
})

describe("isValidWorkspaceSlug", () => {
  it("accepts lowercase letters, numbers and inner hyphens", () => {
    expect(isValidWorkspaceSlug("knight-2026")).toBe(true)
  })

  it("rejects reserved route names", () => {
    expect(isValidWorkspaceSlug("admin")).toBe(false)
    expect(isValidWorkspaceSlug("sign-in")).toBe(false)
  })

  it("rejects leading or trailing hyphens and uppercase", () => {
    expect(isValidWorkspaceSlug("-knight")).toBe(false)
    expect(isValidWorkspaceSlug("knight-")).toBe(false)
    expect(isValidWorkspaceSlug("Knight")).toBe(false)
  })

  it("rejects single characters", () => {
    expect(isValidWorkspaceSlug("k")).toBe(false)
  })
})
