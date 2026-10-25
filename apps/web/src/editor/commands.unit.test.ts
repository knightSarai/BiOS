import { TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import {
  deleteBlockAt,
  moveBlockAt,
  setLink,
  toggleTaskAt,
  turnInto,
} from "./commands"
import {
  blockNames,
  createView,
  doc,
  findText,
  h,
  li,
  p,
  pressKey,
  run,
  task,
  tasks,
  title,
  ul,
} from "./editor-test-utils"
import { editorBaseKeymap, editorKeymap } from "./keymap"
import { marks } from "./schema"

const keymaps = [editorKeymap, editorBaseKeymap]

describe("turnInto", () => {
  it("changes a paragraph into a heading and back", () => {
    const view = createView(doc(p("Plan")), "Plan")
    run(view, turnInto("heading2"))
    expect(view.state.doc.child(1).type.name).toBe("heading")
    expect(view.state.doc.child(1).attrs.level).toBe(2)
    run(view, turnInto("paragraph"))
    expect(view.state.doc.child(1).type.name).toBe("paragraph")
  })

  it("converts only the current list item and keeps its neighbours", () => {
    const view = createView(doc(ul(li("One"), li("Two"), li("Three"))), "Two")
    run(view, turnInto("task_list"))
    expect(blockNames(view.state.doc)).toEqual([
      "title",
      "bullet_list",
      "task_list",
      "bullet_list",
    ])
    expect(view.state.doc.child(2).textContent).toBe("Two")
  })

  it("joins the converted item into a neighbouring list of the same kind", () => {
    const view = createView(
      doc(ul(li("Buy wraps")), tasks(task("Weigh in"))),
      "Buy wraps"
    )
    run(view, turnInto("task_list"))
    expect(blockNames(view.state.doc)).toEqual(["title", "task_list"])
    expect(view.state.doc.child(1).childCount).toBe(2)
  })

  it("replaces an empty paragraph with a divider", () => {
    const view = createView(doc(p("Above"), p()), 15)
    run(view, turnInto("horizontal_rule"))
    expect(blockNames(view.state.doc)).toEqual([
      "title",
      "paragraph",
      "horizontal_rule",
      "paragraph",
    ])
  })

  it("never touches the title", () => {
    const view = createView(doc(p("Body")), 2)
    expect(run(view, turnInto("heading1"))).toBe(false)
    expect(view.state.doc.child(0).type.name).toBe("title")
  })
})

describe("block moves and deletes", () => {
  it("swaps a block with the one above", () => {
    const start = doc(p("First"), p("Second"))
    const view = createView(start, "Second")
    const pos = findText(start, "Second") - 1
    run(view, moveBlockAt(pos, -1))
    expect(view.state.doc.child(1).textContent).toBe("Second")
    expect(view.state.doc.child(2).textContent).toBe("First")
    expect(view.state.selection.$from.parent.textContent).toBe("Second")
  })

  it("does not move a block above the title", () => {
    const start = doc(p("First"))
    const view = createView(start, "First")
    expect(run(view, moveBlockAt(findText(start, "First") - 1, -1))).toBe(false)
  })

  it("moves list items within their list", () => {
    const start = doc(ul(li("One"), li("Two")))
    const view = createView(start, "Two")
    run(view, moveBlockAt(findText(start, "Two") - 2, -1))
    expect(view.state.doc.child(1).child(0).textContent).toBe("Two")
  })

  it("keeps an empty paragraph when the last block is deleted", () => {
    const start = doc(h(1, "Only"))
    const view = createView(start, "Only")
    run(view, deleteBlockAt(findText(start, "Only") - 1))
    expect(blockNames(view.state.doc)).toEqual(["title", "paragraph"])
  })
})

describe("links and tasks", () => {
  it.each([
    ["example.com/bag", "https://example.com/bag"],
    ["mailto:coach@example.com", "mailto:coach@example.com"],
    ["/agent-test/documents", "/agent-test/documents"],
  ])("links %s as %s", (input, expected) => {
    const start = doc(p("heavy bag"))
    const from = findText(start, "heavy")
    const view = createView(start, "heavy")
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, from, from + 5)
      )
    )
    run(view, setLink(input))
    const link = marks.link.isInSet(view.state.doc.child(1).child(0).marks)
    expect(link?.attrs.href).toBe(expected)
  })

  it("toggles a checklist item", () => {
    const start = doc(tasks(task("Weigh in")))
    const view = createView(start, "Weigh in")
    const pos = findText(start, "Weigh in") - 2
    run(view, toggleTaskAt(pos))
    expect(view.state.doc.nodeAt(pos)?.attrs.checked).toBe(true)
  })
})

describe("keyboard", () => {
  it("moves the rest of the title into the body on Enter", () => {
    const view = createView(
      doc(title("Boxing plan"), p("Existing")),
      "Boxing",
      keymaps
    )
    pressKey(view, "Enter")
    expect(view.state.doc.child(0).textContent).toBe("Boxing")
    expect(view.state.doc.child(1).textContent).toBe(" plan")
    expect(view.state.doc.child(2).textContent).toBe("Existing")
    expect(view.state.selection.$from.parent.type.name).toBe("paragraph")
  })

  it("removes an empty first block and returns to the title on Backspace", () => {
    const start = doc(title("Plan"), p(), p("Next"))
    const view = createView(start, 7, keymaps)
    pressKey(view, "Backspace")
    expect(blockNames(view.state.doc)).toEqual(["title", "paragraph"])
    expect(view.state.selection.$from.parent.type.name).toBe("title")
  })

  it("turns a heading back into a paragraph on Backspace at its start", () => {
    const start = doc(h(2, "Section"))
    const view = createView(start, findText(start, "Section"), keymaps)
    pressKey(view, "Backspace")
    expect(view.state.doc.child(1).type.name).toBe("paragraph")
  })

  it("leaves a list when Enter is pressed on an empty item", () => {
    const view = createView(doc(ul(li("One"))), "One", keymaps)
    pressKey(view, "Enter")
    pressKey(view, "Enter")
    expect(blockNames(view.state.doc)).toEqual([
      "title",
      "bullet_list",
      "paragraph",
    ])
  })
})
