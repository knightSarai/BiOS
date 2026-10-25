import { Plugin, PluginKey, type Transaction } from "prosemirror-state"

const createBlockId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12)

const blockIdsPlugin = new Plugin({
  key: new PluginKey("blockIds"),
  appendTransaction(transactions, _oldState, state) {
    if (!transactions.some((tr) => tr.docChanged)) return null

    const owners = new Map<string, { pos: number; size: number }>()
    const needIds: number[] = []

    state.doc.descendants((node, pos) => {
      if ("id" in node.attrs) {
        const id: unknown = node.attrs.id
        const size = node.content.size
        const owner = typeof id === "string" ? owners.get(id) : undefined
        if (typeof id !== "string") {
          needIds.push(pos)
        } else if (!owner) {
          owners.set(id, { pos, size })
        } else if (size > owner.size) {
          needIds.push(owner.pos)
          owners.set(id, { pos, size })
        } else {
          needIds.push(pos)
        }
      }
      return !node.isTextblock
    })

    if (needIds.length === 0) return null
    const tr: Transaction = state.tr
    for (const pos of needIds) tr.setNodeAttribute(pos, "id", createBlockId())
    return tr
  },
})

export { blockIdsPlugin, createBlockId }
