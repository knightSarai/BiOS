import { describe, expect, it } from "vitest"
import { doc, h, li, p, quote, title, ul } from "./editor-test-utils"
import { activeHeadingIndex, outlineOf } from "./outline"

describe("outlineOf", () => {
  it("lists headings in document order with their level", () => {
    const outline = outlineOf(
      doc(title("Plan"), h(1, "test"), p("body"), h(2, "Boxing plan"))
    )
    expect(outline.map(({ level, text }) => ({ level, text }))).toEqual([
      { level: 1, text: "test" },
      { level: 2, text: "Boxing plan" },
    ])
  })

  it("points each heading at its block position", () => {
    const node = doc(h(1, "One"), p("body"), h(3, "Two"))
    for (const heading of outlineOf(node)) {
      expect(node.nodeAt(heading.pos)?.textContent).toBe(heading.text)
    }
  })

  it("skips the title, empty headings and non-heading text", () => {
    const outline = outlineOf(
      doc(title("Heading"), h(1, "  "), quote(p("Quoted")), ul(li("Item")))
    )
    expect(outline).toEqual([])
  })
})

describe("activeHeadingIndex", () => {
  it("picks the last heading scrolled past the threshold", () => {
    expect(activeHeadingIndex([-400, -20, 300], 80)).toBe(1)
  })

  it("falls back to the first heading before any is reached", () => {
    expect(activeHeadingIndex([200, 600], 80)).toBe(0)
  })
})
