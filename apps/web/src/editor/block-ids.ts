import type { Node } from "prosemirror-model"
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "prosemirror-state"
import { Mapping } from "prosemirror-transform"

const createBlockId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12)

type Owner = { pos: number; size: number }

// Where a block now sits if it came through untouched. Pasting at its very
// start replaces its opening token, so fall back to finding it by its end.
const survivingPos = (mapping: Mapping, node: Node, pos: number, doc: Node) => {
  const start = mapping.mapResult(pos, 1)
  if (!start.deleted && doc.nodeAt(start.pos)?.eq(node)) return start.pos
  const end = mapping.mapResult(pos + node.nodeSize, -1)
  const fromEnd = end.pos - node.nodeSize
  if (!end.deleted && fromEnd >= 0 && doc.nodeAt(fromEnd)?.eq(node))
    return fromEnd
  return null
}

// A block that existed before these transactions and came through untouched
// keeps its id, so a copy pasted next to it doesn't take it. Split halves
// differ from the block they came from, and ids that were already duplicated
// have no single survivor; both fall back to the size rule.
const untouchedOwners = (
  transactions: readonly Transaction[],
  oldState: EditorState,
  state: EditorState,
  ids: ReadonlySet<string>
) => {
  const mapping = new Mapping()
  for (const tr of transactions) mapping.appendMapping(tr.mapping)
  const kept = new Map<string, number | null>()
  oldState.doc.descendants((node, pos) => {
    const id: unknown = node.attrs.id
    if (typeof id === "string" && ids.has(id)) {
      const now = survivingPos(mapping, node, pos, state.doc)
      if (now !== null) kept.set(id, kept.has(id) ? null : now)
    }
    return !node.isTextblock
  })
  return kept
}

const blockIdsPlugin = new Plugin({
  key: new PluginKey("blockIds"),
  appendTransaction(transactions, oldState, state) {
    if (!transactions.some((tr) => tr.docChanged)) return null

    const missing: number[] = []
    const first = new Map<string, Owner>()
    const repeats: (Owner & { id: string })[] = []

    state.doc.descendants((node, pos) => {
      if ("id" in node.attrs) {
        const id: unknown = node.attrs.id
        const owner = { pos, size: node.content.size }
        if (typeof id !== "string") missing.push(pos)
        else if (first.has(id)) repeats.push({ ...owner, id })
        else first.set(id, owner)
      }
      return !node.isTextblock
    })

    if (missing.length === 0 && repeats.length === 0) return null

    const duplicated = new Set(repeats.map(({ id }) => id))
    const kept = untouchedOwners(transactions, oldState, state, duplicated)
    const needIds = [...missing]
    for (const id of duplicated) {
      const owners = [
        first.get(id),
        ...repeats.filter((owner) => owner.id === id),
      ].filter((owner) => owner !== undefined)
      const largest = owners.reduce((a, b) => (b.size > a.size ? b : a))
      const ownerPos = kept.get(id) ?? largest.pos
      for (const { pos } of owners) if (pos !== ownerPos) needIds.push(pos)
    }

    const tr: Transaction = state.tr
    for (const pos of needIds) tr.setNodeAttribute(pos, "id", createBlockId())
    return tr
  },
})

export { blockIdsPlugin, createBlockId }
