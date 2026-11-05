import { describe, expect, it } from "vitest"
import { filterSlashBlocks, slashBlocks } from "./block-catalog"
import { shortcutKeys } from "./components/shortcut-keys"

describe("filterSlashBlocks", () => {
  it("returns every slash block for an empty query", () => {
    expect(filterSlashBlocks("  ")).toHaveLength(slashBlocks.length)
  })

  it("leaves out plain text and code blocks", () => {
    const kinds = filterSlashBlocks("").map((item) => item.kind)
    expect(kinds).not.toContain("paragraph")
    expect(filterSlashBlocks("text")).toEqual([])
    expect(filterSlashBlocks("code")).toEqual([])
  })

  it("lists diagram and drawing last", () => {
    const kinds = filterSlashBlocks("").map((item) => item.kind)
    expect(kinds.slice(-2)).toEqual(["mermaid", "drawing"])
  })

  it("ranks label prefixes before aliases", () => {
    expect(filterSlashBlocks("h2")[0]?.kind).toBe("heading2")
    expect(filterSlashBlocks("co")[0]?.kind).toBe("collapsible")
  })

  it("finds blocks by their aliases", () => {
    expect(filterSlashBlocks("todo").map((item) => item.kind)).toEqual([
      "task_list",
    ])
    expect(filterSlashBlocks("toggle").map((item) => item.kind)).toEqual([
      "collapsible",
    ])
    expect(filterSlashBlocks("flowchart").map((item) => item.kind)).toEqual([
      "mermaid",
    ])
  })

  it("returns nothing for an unknown query", () => {
    expect(filterSlashBlocks("issue")).toEqual([])
  })
})

describe("shortcutKeys", () => {
  it("uses symbols on Apple platforms", () => {
    expect(shortcutKeys("Mod-Shift-7", true)).toEqual(["⌘", "⇧", "7"])
  })

  it("spells modifiers out elsewhere and keeps a trailing minus", () => {
    expect(shortcutKeys("Mod-Shift--", false)).toEqual(["Ctrl", "Shift", "-"])
    expect(shortcutKeys("Mod-Alt-1", false)).toEqual(["Ctrl", "Alt", "1"])
  })
})
