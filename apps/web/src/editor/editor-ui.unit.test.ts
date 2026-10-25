import { describe, expect, it } from "vitest"
import { blockIdsPlugin } from "./block-ids"
import { createView, doc, p, pressKey, run } from "./editor-test-utils"
import { editorUiPlugin, openInsertMenu, readUi } from "./editor-ui"
import { editorBaseKeymap } from "./keymap"

const withSlash = (cursor: number | string, body = p()) =>
  createView(doc(body), cursor, [editorUiPlugin, editorBaseKeymap])

const typeText = (view: ReturnType<typeof withSlash>, value: string) => {
  for (const char of value) {
    const { from, to } = view.state.selection
    const fallback = () => view.state.tr.insertText(char, from, to)
    const handled = editorUiPlugin.props.handleTextInput?.call(
      editorUiPlugin,
      view,
      from,
      to,
      char,
      fallback
    )
    if (!handled) view.dispatch(fallback())
  }
}

describe("slash menu", () => {
  it("opens on / at the start of a block and follows the query", () => {
    const view = withSlash(8)
    typeText(view, "/hea")
    expect(readUi(view.state).slash).toMatchObject({
      from: 8,
      query: "hea",
      index: 0,
    })
  })

  it("does not open in the middle of a word", () => {
    const view = withSlash("and", p("and"))
    typeText(view, "/or")
    expect(readUi(view.state).slash).toBeNull()
  })

  it("applies the highlighted item with Enter and removes the typed command", () => {
    const view = withSlash(8)
    typeText(view, "/head")
    pressKey(view, "ArrowDown")
    pressKey(view, "Enter")
    const block = view.state.doc.child(1)
    expect(block.type.name).toBe("heading")
    expect(block.attrs.level).toBe(2)
    expect(block.textContent).toBe("")
    expect(readUi(view.state).slash).toBeNull()
  })

  it("closes on Escape and keeps the text", () => {
    const view = withSlash(8)
    typeText(view, "/to")
    pressKey(view, "Escape")
    expect(readUi(view.state).slash).toBeNull()
    expect(view.state.doc.child(1).textContent).toBe("/to")
  })

  it("closes when the query starts with a space", () => {
    const view = withSlash(8)
    typeText(view, "/ ")
    expect(readUi(view.state).slash).toBeNull()
  })

  it("inserts a new block below a non-empty one before opening", () => {
    const view = withSlash("Plan", p("Plan"))
    run(view, openInsertMenu)
    expect(view.state.doc.child(1).textContent).toBe("Plan")
    expect(view.state.doc.child(2).textContent).toBe("/")
    expect(readUi(view.state).slash?.query).toBe("")
  })
})

describe("block ids", () => {
  it("gives every block a unique id, including the half of a split", () => {
    const view = createView(doc(p("One two")), "One", [
      blockIdsPlugin,
      editorBaseKeymap,
    ])
    view.dispatch(view.state.tr.insertText("!"))
    pressKey(view, "Enter")
    const ids: unknown[] = []
    view.state.doc.descendants((node) => {
      if ("id" in node.attrs) ids.push(node.attrs.id)
    })
    expect(ids).toHaveLength(2)
    expect(ids.every((id) => typeof id === "string")).toBe(true)
    expect(new Set(ids).size).toBe(2)
  })
})
