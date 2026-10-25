import { atom } from "jotai"
import type { EditorState } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"

type EditorSnapshot = {
  view: EditorView
  state: EditorState
}

const createEditorAtoms = () => ({
  snapshot: atom<EditorSnapshot | null>(null),
  linkDraft: atom<string | null>(null),
  blockMenuPos: atom<number | null>(null),
  menuOpen: atom(false),
})

type EditorAtoms = ReturnType<typeof createEditorAtoms>

export { createEditorAtoms }
export type { EditorAtoms, EditorSnapshot }
