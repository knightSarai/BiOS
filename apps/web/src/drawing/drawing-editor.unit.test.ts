import { DEFAULT_SHAPE_STYLE, drawingOf, readShapes } from "@knight-os/drawing"
import { atom, createStore } from "jotai"
import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import { createDrawingEditor } from "./drawing-editor"

const key = (name: string) => ({
  key: name,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  preventDefault: () => {},
  stopPropagation: () => {},
})

const setup = () => {
  const ydoc = new Y.Doc()
  const store = createStore()
  const style = atom(DEFAULT_SHAPE_STYLE)
  const editor = createDrawingEditor(ydoc, "d1", store, style)
  const shapes = () => readShapes(drawingOf(ydoc, "d1"))
  return { ydoc, store, style, editor, shapes }
}

describe("drawing editor", () => {
  it("keeps a new text as a draft until it has text", () => {
    const { store, editor, shapes } = setup()
    editor.setTool("text")
    editor.onKeyDown(key("Enter"))
    const editing = store.get(editor.atoms.editing)
    expect(editing?.draft).not.toBeNull()
    expect(shapes()).toEqual([])
    editor.stopEditing()
    expect(shapes()).toEqual([])
    expect(store.get(editor.atoms.selection).size).toBe(0)
  })

  it("commits a draft text with its typed content", () => {
    const { store, editor, shapes } = setup()
    editor.setTool("text")
    editor.onKeyDown(key("Enter"))
    const id = store.get(editor.atoms.editing)?.id ?? ""
    editor.setLabel(id, "Hello")
    expect(shapes()).toEqual([])
    editor.stopEditing()
    expect(shapes()).toMatchObject([{ kind: "text", text: "Hello" }])
  })

  it("commits the current draft when editing moves to another shape", () => {
    const { store, editor, shapes } = setup()
    editor.setTool("rect")
    editor.onKeyDown(key("Enter"))
    const boxId = store.get(editor.atoms.editing)?.id ?? ""
    editor.stopEditing()
    editor.setTool("text")
    editor.onKeyDown(key("Enter"))
    const textId = store.get(editor.atoms.editing)?.id ?? ""
    editor.setLabel(textId, "Note")
    store.set(editor.atoms.selection, new Set([boxId]))
    editor.onKeyDown(key("Enter"))
    expect(store.get(editor.atoms.editing)?.id).toBe(boxId)
    expect(shapes().map((s) => s.kind)).toEqual(["rect", "text"])
  })

  it("creates a box from the keyboard and opens its label", () => {
    const { store, editor, shapes } = setup()
    editor.setTool("diamond")
    editor.onKeyDown(key("Enter"))
    expect(shapes()).toMatchObject([{ kind: "diamond", w: 140, h: 64 }])
    expect(store.get(editor.atoms.tool)).toBe("select")
    expect(store.get(editor.atoms.editing)?.id).toBe(shapes()[0]?.id)
  })

  it("gives each label its own undo step, even when typed back to back", () => {
    const { store, editor, shapes } = setup()
    const created: string[] = []
    for (let i = 0; i < 2; i++) {
      editor.setTool("rect")
      editor.onKeyDown(key("Enter"))
      created.push(store.get(editor.atoms.editing)?.id ?? "")
      editor.stopEditing()
    }
    const [first = "", second = ""] = created
    store.set(editor.atoms.selection, new Set([first]))
    editor.onKeyDown(key("Enter"))
    editor.setLabel(first, "One")
    store.set(editor.atoms.selection, new Set([second]))
    editor.onKeyDown(key("Enter"))
    editor.setLabel(second, "Two")
    editor.stopEditing()
    editor.undo()
    const labels = shapes().map((s) => (s.kind === "rect" ? s.label : ""))
    expect(labels).toEqual(["One", ""])
  })

  it("remembers the last style for new shapes across drawings", () => {
    const { ydoc, store, style, editor } = setup()
    editor.setTool("rect")
    editor.onKeyDown(key("Enter"))
    editor.stopEditing()
    editor.restyle({ stroke: "chart-3", rough: true })
    const next = createDrawingEditor(ydoc, "d2", store, style)
    next.setTool("ellipse")
    next.onKeyDown(key("Enter"))
    expect(readShapes(drawingOf(ydoc, "d2"))).toMatchObject([
      { kind: "ellipse", stroke: "chart-3", rough: true },
    ])
  })

  it("imports an Excalidraw file beside what is already drawn", async () => {
    const { store, editor, shapes } = setup()
    editor.setTool("rect")
    editor.onKeyDown(key("Enter"))
    editor.stopEditing()
    const scene = {
      elements: [
        { id: "r", type: "rectangle", x: -500, y: 900, width: 100, height: 50 },
        { id: "i", type: "image", x: 0, y: 0 },
      ],
    }
    const note = JSON.stringify(scene)
    const summary = await editor.importFile(
      new File([note], "sketch.excalidraw")
    )
    expect(summary).toEqual({ count: 1, skipped: { image: 1 }, simplified: {} })
    const [existing, imported] = shapes()
    expect(
      imported?.kind === "rect" && existing?.kind === "rect" && imported.x
    ).toBe(existing?.kind === "rect" ? existing.x + existing.w + 80 : null)
    expect(store.get(editor.atoms.selection)).toEqual(new Set([imported?.id]))
  })

  it("reports a file that holds no drawing", async () => {
    const { editor } = setup()
    expect(
      await editor.importFile(new File(["# notes"], "notes.md"))
    ).toBeNull()
  })
})
