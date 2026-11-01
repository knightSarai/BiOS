import { Slice } from "prosemirror-model"
import { ySyncPluginKey } from "y-prosemirror"
import { describe, expect, it } from "vitest"
import { duplicateBlockAt, turnInto } from "./commands"
import {
  DRAWING_CREATED_META,
  drawingIdsIn,
  drawingIdsPlugin,
  withDrawingSnapshots,
} from "./drawing-ids"
import { applySlashItem, editorUiPlugin } from "./editor-ui"
import { createView, doc, li, p, run, ul } from "./editor-test-utils"
import { schema } from "./schema"

const drawing = (drawingId: string | null, snapshot: string | null = null) =>
  schema.node("drawing", { drawingId, snapshot })

const fakeStore = (existing: string[] = []) => {
  const known = new Set(existing)
  const calls: string[] = []
  return {
    calls,
    store: {
      has: (id: string) => known.has(id),
      copy: (from: string, to: string) => {
        known.add(to)
        calls.push(`copy ${from}`)
      },
      restore: (id: string, snapshot: string) => {
        known.add(id)
        calls.push(`restore ${snapshot}`)
      },
    },
  }
}

const insertAtEnd = (
  view: ReturnType<typeof createView>,
  node: ReturnType<typeof drawing>
) =>
  run(view, (state, dispatch) => {
    dispatch?.(state.tr.insert(state.doc.content.size, node))
    return true
  })

describe("inserting a drawing", () => {
  it("creates a fresh id and asks for the editor to open", () => {
    const view = createView(doc(p("")), 8)
    let created: unknown = null
    turnInto("drawing")(view.state, (tr) => {
      created = tr.getMeta(DRAWING_CREATED_META)
      view.dispatch(tr)
    })
    const ids = [...drawingIdsIn(view.state.doc)]
    expect(ids).toHaveLength(1)
    expect(created).toBe(ids[0])
  })

  it("still asks for the editor when inserted from the slash menu", () => {
    const view = createView(doc(p("/draw")), 13, [editorUiPlugin])
    run(view, (state, dispatch) => {
      dispatch?.(
        state.tr.setMeta(editorUiPlugin, { type: "slash-open", from: 8 })
      )
      return true
    })
    let created: unknown = null
    applySlashItem("drawing")(view.state, (tr) => {
      created = tr.getMeta(DRAWING_CREATED_META)
      view.dispatch(tr)
    })
    expect(typeof created).toBe("string")
    expect([...drawingIdsIn(view.state.doc)]).toEqual([created])
  })
})

describe("drawingIdsPlugin", () => {
  it("gives a duplicated block its own copy of the drawing", () => {
    const { store, calls } = fakeStore(["original"])
    const view = createView(doc(drawing("original"), p("after")), 1, [
      drawingIdsPlugin(store),
    ])
    run(view, duplicateBlockAt(view.state.doc.child(0).nodeSize))
    const ids = [...drawingIdsIn(view.state.doc)]
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe("original")
    expect(calls).toEqual(["copy original"])
  })

  it("rebuilds a drawing pasted from another document", () => {
    const { store, calls } = fakeStore()
    const view = createView(doc(p("x")), 1, [drawingIdsPlugin(store)])
    insertAtEnd(view, drawing("elsewhere", "[shapes]"))
    expect(calls).toEqual(["restore [shapes]"])
    const pasted = view.state.doc.lastChild
    expect(pasted?.attrs).toMatchObject({
      drawingId: "elsewhere",
      snapshot: null,
    })
  })

  it("keeps the drawing of a block cut and pasted in the same document", () => {
    const { store, calls } = fakeStore(["here"])
    const view = createView(doc(p("x")), 1, [drawingIdsPlugin(store)])
    insertAtEnd(view, drawing("here", "[old shapes]"))
    expect(calls).toEqual([])
    expect(view.state.doc.lastChild?.attrs).toMatchObject({
      drawingId: "here",
      snapshot: null,
    })
  })

  it("assigns an id to a pasted drawing that has none", () => {
    const { store } = fakeStore()
    const view = createView(doc(p("x")), 1, [drawingIdsPlugin(store)])
    insertAtEnd(view, drawing(null))
    expect([...drawingIdsIn(view.state.doc)]).toHaveLength(1)
  })

  it("leaves changes that came through Yjs alone", () => {
    const { store, calls } = fakeStore(["shared"])
    const view = createView(doc(drawing("shared"), p("x")), 1, [
      drawingIdsPlugin(store),
    ])
    run(view, (state, dispatch) => {
      dispatch?.(
        state.tr
          .insert(state.doc.content.size, drawing("shared"))
          .setMeta(ySyncPluginKey, { isChangeOrigin: true })
      )
      return true
    })
    expect(calls).toEqual([])
    expect([...drawingIdsIn(view.state.doc)]).toEqual(["shared"])
  })
})

describe("withDrawingSnapshots", () => {
  it("adds each drawing's shapes to a copied slice and keeps text intact", () => {
    const content = doc(p("before"), drawing("d1"), p("after")).content
    const slice = withDrawingSnapshots(
      new Slice(content, 0, 0),
      (id) => `shapes of ${id}`
    )
    const names: string[] = []
    slice.content.forEach((node) =>
      names.push(
        node.type.name === "drawing"
          ? `${node.attrs.snapshot}`
          : node.textContent
      )
    )
    expect(names).toEqual(["Title", "before", "shapes of d1", "after"])
  })
})

describe("drawingIdsPlugin with a copy pasted above its original", () => {
  it("keeps the original's id on the block that was already there", () => {
    const { store, calls } = fakeStore(["original"])
    const view = createView(doc(p("x"), drawing("original")), 1, [
      drawingIdsPlugin(store),
    ])
    const titleSize = view.state.doc.child(0).nodeSize
    run(view, (state, dispatch) => {
      dispatch?.(state.tr.insert(titleSize, drawing("original")))
      return true
    })
    const ids = [...view.state.doc.content.content]
      .filter((node) => node.type.name === "drawing")
      .map((node) => node.attrs.drawingId as string)
    expect(ids[1]).toBe("original")
    expect(ids[0]).not.toBe("original")
    expect(calls).toEqual(["copy original"])
  })
})

describe("drawingIdsPlugin keeps originals in place", () => {
  const drawingIds = (view: ReturnType<typeof createView>) => {
    const ids: string[] = []
    view.state.doc.descendants((node) => {
      if (node.type.name === "drawing") ids.push(node.attrs.drawingId as string)
      return true
    })
    return ids
  }

  it("when the copy is inserted exactly where the original starts", () => {
    const { store, calls } = fakeStore(["original"])
    const view = createView(doc(p("x"), drawing("original")), 1, [
      drawingIdsPlugin(store),
    ])
    const originalPos =
      view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize
    run(view, (state, dispatch) => {
      dispatch?.(state.tr.insert(originalPos, drawing("original")))
      return true
    })
    const ids = drawingIds(view)
    expect(ids[1]).toBe("original")
    expect(ids[0]).not.toBe("original")
    expect(calls).toEqual(["copy original"])
  })

  it("when the copy is pasted inside a list item above it", () => {
    const { store, calls } = fakeStore(["original"])
    const view = createView(doc(ul(li("item")), drawing("original")), 1, [
      drawingIdsPlugin(store),
    ])
    const titleSize = view.state.doc.child(0).nodeSize
    const insideItem =
      titleSize + 1 + 1 + view.state.doc.child(1).child(0).child(0).nodeSize
    run(view, (state, dispatch) => {
      dispatch?.(state.tr.insert(insideItem, drawing("original")))
      return true
    })
    const ids = drawingIds(view)
    expect(ids).toHaveLength(2)
    expect(ids[1]).toBe("original")
    expect(calls).toEqual(["copy original"])
  })

  it("when the original is pasted over itself", () => {
    const { store, calls } = fakeStore(["original"])
    const view = createView(doc(p("x"), drawing("original")), 1, [
      drawingIdsPlugin(store),
    ])
    const pos =
      view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize
    run(view, (state, dispatch) => {
      dispatch?.(
        state.tr.replaceWith(pos, pos + 1, drawing("original", "[shapes]"))
      )
      return true
    })
    expect(drawingIds(view)).toEqual(["original"])
    expect(calls).toEqual([])
    expect(view.state.doc.lastChild?.attrs.snapshot).toBeNull()
  })
})
