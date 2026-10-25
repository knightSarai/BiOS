import { describe, expect, it } from "vitest"
import { blockCatalog, filterBlockCatalog } from "./block-catalog"
import { shortcutKeys } from "./components/shortcut-keys"

describe("filterBlockCatalog", () => {
  it("returns every block for an empty query", () => {
    expect(filterBlockCatalog("  ")).toHaveLength(blockCatalog.length)
  })

  it("ranks label prefixes before aliases", () => {
    expect(filterBlockCatalog("h2")[0]?.kind).toBe("heading2")
    expect(filterBlockCatalog("co")[0]?.kind).toBe("code_block")
  })

  it("finds blocks by their aliases", () => {
    expect(filterBlockCatalog("todo").map((item) => item.kind)).toEqual([
      "task_list",
    ])
    expect(filterBlockCatalog("toggle").map((item) => item.kind)).toEqual([
      "collapsible",
    ])
  })

  it("returns nothing for an unknown query", () => {
    expect(filterBlockCatalog("issue")).toEqual([])
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
