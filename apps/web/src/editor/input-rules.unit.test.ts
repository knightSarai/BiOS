import { describe, expect, it } from "vitest"
import {
  blockNames,
  createView,
  doc,
  p,
  title,
  typeText,
} from "./editor-test-utils"
import { editorInputRules } from "./input-rules"
import { marks } from "./schema"

const emptyBody = () => createView(doc(p()), 8, [editorInputRules])

describe("markdown shortcuts", () => {
  it.each([
    ["# ", "heading", 1],
    ["## ", "heading", 2],
    ["### ", "heading", 3],
  ])("turns %j into a level %s heading", (input, type, level) => {
    const view = emptyBody()
    typeText(view, `${input}Plan`)
    const block = view.state.doc.child(1)
    expect(block.type.name).toBe(type)
    expect(block.attrs.level).toBe(level)
    expect(block.textContent).toBe("Plan")
  })

  it.each([
    ["- ", "bullet_list"],
    ["* ", "bullet_list"],
    ["1. ", "ordered_list"],
    ["> ", "blockquote"],
    ["[] ", "task_list"],
  ])("wraps %j into a %s", (input, type) => {
    const view = emptyBody()
    typeText(view, `${input}Item`)
    expect(blockNames(view.state.doc)).toEqual(["title", type])
    expect(view.state.doc.child(1).textContent).toBe("Item")
  })

  it("starts a checked item from [x]", () => {
    const view = emptyBody()
    typeText(view, "[x] Done")
    const item = view.state.doc.child(1).child(0)
    expect(item.type.name).toBe("task_item")
    expect(item.attrs.checked).toBe(true)
  })

  it("turns ``` into a code block", () => {
    const view = emptyBody()
    typeText(view, "``` const x = 1")
    expect(blockNames(view.state.doc)).toEqual(["title", "code_block"])
    expect(view.state.doc.child(1).textContent).toBe("const x = 1")
  })

  it("replaces --- with a divider and a fresh paragraph", () => {
    const view = emptyBody()
    typeText(view, "---")
    expect(blockNames(view.state.doc)).toEqual([
      "title",
      "horizontal_rule",
      "paragraph",
    ])
  })

  it.each([
    ["**bold**", marks.strong],
    ["*soft*", marks.em],
    ["_soft_", marks.em],
    ["~~gone~~", marks.strike],
    ["`code`", marks.code],
  ])("formats %s and drops the markers", (input, mark) => {
    const view = emptyBody()
    typeText(view, `a ${input} b`)
    const paragraph = view.state.doc.child(1)
    expect(paragraph.textContent).toBe(`a ${input.replace(/[*_~`]/g, "")} b`)
    const formatted = paragraph.child(1)
    expect(mark.isInSet(formatted.marks)).toBeTruthy()
    expect(mark.isInSet(paragraph.lastChild?.marks ?? [])).toBeFalsy()
  })

  it("leaves the title plain", () => {
    const view = createView(doc(title(""), p()), 1, [editorInputRules])
    typeText(view, "## **Not a heading**")
    expect(view.state.doc.child(0).type.name).toBe("title")
    expect(view.state.doc.child(0).textContent).toBe("## **Not a heading**")
  })

  it("does not format inside code blocks", () => {
    const view = emptyBody()
    typeText(view, "``` **raw**")
    expect(view.state.doc.child(1).textContent).toBe("**raw**")
  })
})
