import { atom } from "jotai"
import type { EditorState } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { DEFAULT_SHAPE_STYLE, type ShapeStyle } from "@knight-os/drawing"
import type { DrawingEditor } from "@/drawing/drawing-editor"

type EditorSnapshot = {
  view: EditorView
  state: EditorState
}

const createEditorAtoms = () => ({
  snapshot: atom<EditorSnapshot | null>(null),
  linkDraft: atom<string | null>(null),
  menuOpen: atom(false),
  drawingEditor: atom<DrawingEditor | null>(null),
  drawingOpen: atom(false),
  drawingStyle: atom<ShapeStyle>(DEFAULT_SHAPE_STYLE),
  activeHeading: atom(0),
})

type EditorAtoms = ReturnType<typeof createEditorAtoms>

export { createEditorAtoms }
export type { EditorAtoms, EditorSnapshot }
