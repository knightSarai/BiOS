import { AllSelection, TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror"
import * as Y from "yjs"
import { blockIdsPlugin } from "./block-ids"
import { deleteBlockAt, setLink, turnInto } from "./commands"
import { DOCUMENT_FRAGMENT, seedDocument } from "./document-content"
import {
  blockNames,
  createView,
  doc,
  findText,
  li,
  p,
  pressKey,
  run,
  task,
  tasks,
  title,
  typeText,
  ul,
} from "./editor-test-utils"
import { editorInputRules } from "./input-rules"
import { editorBaseKeymap, editorKeymap } from "./keymap"
import { marks, schema } from "./schema"

const keymaps = [editorKeymap, editorBaseKeymap]

describe("document seeding", () => {
  it("merges seeds from two devices into a single valid document", () => {
    const first = new Y.Doc()
    const second = new Y.Doc()
    seedDocument(first)
    seedDocument(second)
    Y.applyUpdate(first, Y.encodeStateAsUpdate(second))

    const merged = yXmlFragmentToProseMirrorRootNode(
      first.getXmlFragment(DOCUMENT_FRAGMENT),
      schema
    )
    expect(() => merged.check()).not.toThrow()
    expect(blockNames(merged)).toEqual(["title", "paragraph"])
  })

  it("leaves existing content alone", () => {
    const ydoc = new Y.Doc()
    seedDocument(ydoc)
    const before = Y.encodeStateVector(ydoc)
    seedDocument(ydoc)
    expect(Y.encodeStateVector(ydoc)).toEqual(before)
  })
})

describe("commands", () => {
  it("inserts a divider when the whole document is selected", () => {
    const view = createView(doc(p("One")))
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
    expect(() => run(view, turnInto("horizontal_rule"))).not.toThrow()
    expect(blockNames(view.state.doc)).toContain("horizontal_rule")
  })

  it("turns each selected paragraph into its own list item", () => {
    const start = doc(p("One"), p("Two"), p("Three"))
    const view = createView(start)
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(
          start,
          findText(start, "One"),
          findText(start, "Three") + 5
        )
      )
    )
    run(view, turnInto("bullet_list"))
    expect(blockNames(view.state.doc)).toEqual(["title", "bullet_list"])
    expect(view.state.doc.child(1).childCount).toBe(3)
  })

  it("removes the whole list when its only item is deleted", () => {
    const start = doc(p("Keep"), ul(li("Only")))
    const view = createView(start)
    run(view, deleteBlockAt(findText(start, "Only") - 2))
    expect(blockNames(view.state.doc)).toEqual(["title", "paragraph"])
  })

  it("refuses unsafe link schemes", () => {
    const start = doc(p("click me"))
    const view = createView(start)
    const from = findText(start, "click")
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(start, from, from + 5))
    )
    run(view, setLink("javascript:alert(1)"))
    expect(view.state.doc.rangeHasMark(from, from + 5, marks.link)).toBe(false)
  })

  it("unlinks a whole link even when part of it is bold", () => {
    const link = marks.link.create({ href: "https://example.com" })
    const start = doc(
      schema.node("paragraph", null, [
        schema.text("heavy ", [link]),
        schema.text("bag", [link, marks.strong.create()]),
      ])
    )
    const view = createView(start, findText(start, "heavy") + 2)
    run(view, setLink(""))
    expect(
      view.state.doc.rangeHasMark(0, view.state.doc.content.size, marks.link)
    ).toBe(false)
  })
})

describe("keyboard", () => {
  it("starts a new task unchecked after a checked one", () => {
    const view = createView(doc(tasks(task("Done", true))), "Done", keymaps)
    pressKey(view, "Enter")
    const list = view.state.doc.child(1)
    expect(list.child(0).attrs.checked).toBe(true)
    expect(list.child(1).attrs.checked).toBe(false)
  })

  it("does not stack empty paragraphs when Enter is pressed at the end of the title", () => {
    const view = createView(doc(title("Plan"), p()), "Plan", keymaps)
    pressKey(view, "Enter")
    expect(blockNames(view.state.doc)).toEqual(["title", "paragraph"])
    expect(view.state.selection.$from.parent.type.name).toBe("paragraph")
  })
})

describe("markdown marks", () => {
  it("keeps existing links and line breaks inside the formatted range", () => {
    const link = marks.link.create({ href: "https://example.com" })
    const start = doc(
      schema.node("paragraph", null, [
        schema.text("*"),
        schema.text("bag", [link]),
        schema.node("hard_break"),
        schema.text("rope"),
      ])
    )
    const view = createView(start, "rope", [editorInputRules])
    typeText(view, "*")
    const paragraph = view.state.doc.child(1)
    expect(paragraph.textContent).toBe("bagrope")
    expect(paragraph.child(1).type.name).toBe("hard_break")
    expect(marks.link.isInSet(paragraph.child(0).marks)).toBeTruthy()
    expect(marks.em.isInSet(paragraph.child(0).marks)).toBeTruthy()
  })
})

describe("block ids", () => {
  it("keeps a block's id on its text when Enter is pressed at its start", () => {
    const start = doc(p("Keep me"))
    const view = createView(start, findText(start, "Keep"), [
      blockIdsPlugin,
      ...keymaps,
    ])
    view.dispatch(
      view.state.tr.setNodeAttribute(
        findText(start, "Keep") - 1,
        "id",
        "original"
      )
    )
    pressKey(view, "Enter")
    const textBlock = view.state.doc.child(2)
    expect(textBlock.textContent).toBe("Keep me")
    expect(textBlock.attrs.id).toBe("original")
    expect(view.state.doc.child(1).attrs.id).not.toBe("original")
  })
})
