import { Fragment, Slice, type Node } from "prosemirror-model"
import {
  NodeSelection,
  Plugin,
  PluginKey,
  type Command,
  type EditorState,
  type Transaction,
} from "prosemirror-state"
import { Mapping } from "prosemirror-transform"
import { ySyncPluginKey } from "y-prosemirror"
import { nodes } from "./schema"

type DrawingStore = {
  has: (drawingId: string) => boolean
  copy: (fromId: string, toId: string) => void
  restore: (drawingId: string, snapshot: string) => void
}

const DRAWING_CREATED_META = "createdDrawingId"

const createDrawingId = () =>
  crypto.randomUUID().replaceAll("-", "").slice(0, 16)

const drawingIdsIn = (doc: Node) => {
  const ids = new Set<string>()
  doc.descendants((node) => {
    if (node.type === nodes.drawing && typeof node.attrs.drawingId === "string")
      ids.add(node.attrs.drawingId)
    return !node.isTextblock
  })
  return ids
}

// Changes that arrive through Yjs (another device, or Yjs undo) were already
// settled where they were made; acting on them again would copy twice.
const isFromYjs = (tr: Transaction) => {
  const meta = tr.getMeta(ySyncPluginKey) as
    { isChangeOrigin?: boolean } | undefined
  return meta?.isChangeOrigin === true
}

type Fix = { pos: number; drawingId: string }

// Where each drawing that existed before these transactions sits now, so a
// copy pasted above its original doesn't take the original's id.
const survivingPositions = (
  transactions: readonly Transaction[],
  oldState: EditorState,
  state: EditorState
) => {
  const mapping = new Mapping()
  for (const tr of transactions) mapping.appendMapping(tr.mapping)
  const kept = new Map<string, number>()
  oldState.doc.descendants((node, pos) => {
    if (node.type !== nodes.drawing) return !node.isTextblock
    const id: unknown = node.attrs.drawingId
    const mapped = mapping.mapResult(pos, 1)
    const now = mapped.deleted ? null : state.doc.nodeAt(mapped.pos)
    if (typeof id === "string" && now?.attrs.drawingId === id)
      kept.set(id, mapped.pos)
    return false
  })
  return kept
}

// Every drawing block owns one drawing. A duplicated block gets a copy of the
// original's shapes; a pasted block whose drawing this document doesn't have
// is rebuilt from the snapshot it carried on the clipboard.
const drawingIdsPlugin = (store: DrawingStore) =>
  new Plugin({
    key: new PluginKey("drawingIds"),
    appendTransaction(transactions, oldState, state) {
      const local = transactions.filter((tr) => tr.docChanged && !isFromYjs(tr))
      if (local.length === 0) return null
      const kept = survivingPositions(transactions, oldState, state)
      const seen = new Set<string>()
      const fixes: Fix[] = []
      state.doc.descendants((node, pos) => {
        if (node.type !== nodes.drawing) return !node.isTextblock
        const id: unknown = node.attrs.drawingId
        const snapshot: unknown = node.attrs.snapshot
        const carried = typeof snapshot === "string" ? snapshot : null
        const ownedElsewhere =
          typeof id === "string" && kept.has(id) && kept.get(id) !== pos
        if (typeof id !== "string" || seen.has(id) || ownedElsewhere) {
          const drawingId = createDrawingId()
          if (typeof id === "string" && store.has(id)) store.copy(id, drawingId)
          else if (carried) store.restore(drawingId, carried)
          fixes.push({ pos, drawingId })
        } else {
          seen.add(id)
          if (carried && !store.has(id)) store.restore(id, carried)
          if (carried) fixes.push({ pos, drawingId: id })
        }
        return false
      })
      if (fixes.length === 0) return null
      const tr = state.tr
      for (const { pos, drawingId } of fixes) {
        tr.setNodeAttribute(pos, "drawingId", drawingId)
        tr.setNodeAttribute(pos, "snapshot", null)
      }
      return tr
    },
  })

const withSnapshots = (
  fragment: Fragment,
  snapshot: (drawingId: string) => string
): Fragment => {
  const children: Node[] = []
  fragment.forEach((node) => {
    const drawingId: unknown = node.attrs.drawingId
    children.push(
      node.type === nodes.drawing && typeof drawingId === "string"
        ? node.type.create({ ...node.attrs, snapshot: snapshot(drawingId) })
        : node.content.size > 0
          ? node.copy(withSnapshots(node.content, snapshot))
          : node
    )
  })
  return Fragment.from(children)
}

const withDrawingSnapshots = (
  slice: Slice,
  snapshot: (drawingId: string) => string
) =>
  new Slice(
    withSnapshots(slice.content, snapshot),
    slice.openStart,
    slice.openEnd
  )

const onSelectedDrawing =
  (open: (drawingId: string) => void): Command =>
  (state, dispatch) => {
    const { selection } = state
    if (
      !(selection instanceof NodeSelection) ||
      selection.node.type !== nodes.drawing
    ) {
      return false
    }
    const drawingId: unknown = selection.node.attrs.drawingId
    if (typeof drawingId !== "string") return false
    if (dispatch) open(drawingId)
    return true
  }

export {
  DRAWING_CREATED_META,
  createDrawingId,
  drawingIdsIn,
  drawingIdsPlugin,
  onSelectedDrawing,
  withDrawingSnapshots,
}
export type { DrawingStore }
