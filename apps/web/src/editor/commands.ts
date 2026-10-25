import { lift, setBlockType, toggleMark, wrapIn } from "prosemirror-commands"
import type { MarkType, Node, NodeType } from "prosemirror-model"
import { liftListItem, sinkListItem, wrapInList } from "prosemirror-schema-list"
import { canJoin } from "prosemirror-transform"
import {
  NodeSelection,
  Selection,
  TextSelection,
  type Command,
  type EditorState,
  type Transaction,
} from "prosemirror-state"
import type { BlockKind } from "./block-catalog"
import { normalizeHref } from "./links"
import { marks, nodes } from "./schema"

class Chain {
  readonly tr: Transaction
  private current: EditorState

  constructor(private readonly start: EditorState) {
    this.tr = start.tr
    this.current = start
  }

  get state() {
    return this.current
  }

  run(command: Command) {
    return command(this.current, (step) => {
      for (const s of step.steps) this.tr.step(s)
      this.current = this.current.apply(step)
    })
  }

  dispatch(dispatch: (tr: Transaction) => void) {
    if (
      !this.tr.docChanged &&
      this.current.selection.eq(this.start.selection)
    ) {
      return false
    }
    this.tr.setSelection(
      Selection.fromJSON(this.tr.doc, this.current.selection.toJSON())
    )
    dispatch(this.tr.scrollIntoView())
    return true
  }
}

const isInTitle = (state: EditorState) =>
  state.selection.$from.parent.type === nodes.title ||
  state.selection.$to.parent.type === nodes.title

const listItemTypes = new Set<NodeType>([nodes.list_item, nodes.task_item])
const listTypes = new Set<NodeType>([
  nodes.bullet_list,
  nodes.ordered_list,
  nodes.task_list,
])

const liftOnce: Command = (state, dispatch) => {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const type = $from.node(depth).type
    if (listItemTypes.has(type)) return liftListItem(type)(state, dispatch)
    if (type === nodes.blockquote || type === nodes.collapsible) {
      return lift(state, dispatch)
    }
  }
  return false
}

const unwrapAll = (chain: Chain) => {
  for (let i = 0; i < 12 && chain.run(liftOnce); i++);
}

const listTypesByKind = {
  bullet_list: nodes.bullet_list,
  ordered_list: nodes.ordered_list,
  task_list: nodes.task_list,
} as const

const joinAdjacentLists: Command = (state, dispatch) => {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (!listTypes.has(node.type)) continue
    const start = $from.before(depth)
    const end = start + node.nodeSize
    const after = state.doc.resolve(end).nodeAfter
    const before = state.doc.resolve(start).nodeBefore
    const joinAfter = after?.type === node.type && canJoin(state.doc, end)
    const joinBefore = before?.type === node.type && canJoin(state.doc, start)
    if (!joinAfter && !joinBefore) return false
    if (dispatch) {
      const tr = state.tr
      if (joinAfter) tr.join(end)
      if (joinBefore) tr.join(start)
      dispatch(tr)
    }
    return true
  }
  return false
}

const insertDivider: Command = (state, dispatch) => {
  if (isInTitle(state)) return false
  if (dispatch) {
    const { $from, to } = state.selection
    const atTopLevel = $from.depth === 0
    const block = atTopLevel ? null : $from.node(1)
    const start = atTopLevel ? to : $from.before(1)
    const end = atTopLevel ? to : $from.after(1)
    const divider = nodes.horizontal_rule.create()
    const paragraph = nodes.paragraph.create()
    const tr = state.tr
    const isEmptyParagraph =
      block?.type === nodes.paragraph && block.content.size === 0
    const insertAt = isEmptyParagraph ? start : end
    if (isEmptyParagraph) tr.replaceWith(start, end, [divider, paragraph])
    else tr.insert(end, [divider, paragraph])
    tr.setSelection(
      TextSelection.create(tr.doc, insertAt + divider.nodeSize + 1)
    )
    dispatch(tr.scrollIntoView())
  }
  return true
}

const turnInto =
  (kind: BlockKind): Command =>
  (state, dispatch) => {
    if (isInTitle(state)) return false
    if (kind === "horizontal_rule") return insertDivider(state, dispatch)

    const chain = new Chain(state)
    unwrapAll(chain)

    switch (kind) {
      case "paragraph":
        chain.run(setBlockType(nodes.paragraph))
        break
      case "heading1":
      case "heading2":
      case "heading3":
        chain.run(
          setBlockType(nodes.heading, { level: Number(kind.slice(-1)) })
        )
        break
      case "code_block":
        chain.run(setBlockType(nodes.code_block))
        break
      case "blockquote":
        chain.run(setBlockType(nodes.paragraph))
        chain.run(wrapIn(nodes.blockquote))
        break
      case "collapsible":
        chain.run(setBlockType(nodes.paragraph))
        chain.run(wrapIn(nodes.collapsible))
        break
      default:
        chain.run(setBlockType(nodes.paragraph))
        chain.run(wrapInList(listTypesByKind[kind]))
        chain.run(joinAdjacentLists)
    }

    return dispatch ? chain.dispatch(dispatch) : true
  }

const activeBlockKind = (state: EditorState): BlockKind | null => {
  if (isInTitle(state)) return null
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const type = $from.node(depth).type
    if (type === nodes.task_list) return "task_list"
    if (type === nodes.bullet_list) return "bullet_list"
    if (type === nodes.ordered_list) return "ordered_list"
    if (type === nodes.blockquote) return "blockquote"
    if (type === nodes.collapsible) return "collapsible"
  }
  const parent = $from.parent
  if (parent.type === nodes.heading) {
    return `heading${parent.attrs.level as 1 | 2 | 3}`
  }
  if (parent.type === nodes.code_block) return "code_block"
  return "paragraph"
}

const movableBlockPos = (state: EditorState) => {
  const { selection } = state
  if (
    selection instanceof NodeSelection &&
    selection.node.type !== nodes.title
  ) {
    return selection.from
  }
  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if (listItemTypes.has($from.node(depth).type) || depth === 1) {
      return $from.node(depth).type === nodes.title ? null : $from.before(depth)
    }
  }
  return null
}

const firstMovableIndex = (parent: Node) =>
  parent.type === parent.type.schema.topNodeType ? 1 : 0

const moveBlockAt =
  (pos: number, direction: -1 | 1): Command =>
  (state, dispatch) => {
    const $pos = state.doc.resolve(pos)
    const node = $pos.nodeAfter
    if (!node) return false
    const parent = $pos.parent
    const index = $pos.index()
    const swapIndex = index + direction
    if (
      swapIndex < firstMovableIndex(parent) ||
      swapIndex >= parent.childCount
    ) {
      return false
    }
    if (dispatch) {
      const sibling = parent.child(swapIndex)
      const { from, to } = state.selection
      const inside = from >= pos && to <= pos + node.nodeSize
      const tr = state.tr
      const newPos =
        direction === -1 ? pos - sibling.nodeSize : pos + sibling.nodeSize
      if (direction === -1) {
        tr.replaceWith(newPos, pos + node.nodeSize, [node, sibling])
      } else {
        tr.replaceWith(pos, pos + node.nodeSize + sibling.nodeSize, [
          sibling,
          node,
        ])
      }
      if (
        state.selection instanceof NodeSelection &&
        state.selection.from === pos
      ) {
        tr.setSelection(NodeSelection.create(tr.doc, newPos))
      } else if (inside) {
        tr.setSelection(
          TextSelection.create(
            tr.doc,
            newPos + (from - pos),
            newPos + (to - pos)
          )
        )
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }

const moveBlock =
  (direction: -1 | 1): Command =>
  (state, dispatch) => {
    const pos = movableBlockPos(state)
    return pos === null ? false : moveBlockAt(pos, direction)(state, dispatch)
  }

const duplicateBlockAt =
  (pos: number): Command =>
  (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (!node || node.type === nodes.title) return false
    if (dispatch) dispatch(state.tr.insert(pos + node.nodeSize, node))
    return true
  }

const deleteBlockAt =
  (pos: number): Command =>
  (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (!node || node.type === nodes.title) return false
    if (dispatch) {
      const $pos = state.doc.resolve(pos)
      const isOnlyListItem =
        listItemTypes.has(node.type) && $pos.parent.childCount === 1
      const from = isOnlyListItem ? $pos.before() : pos
      const to = isOnlyListItem ? $pos.after() : pos + node.nodeSize
      const tr = state.tr.delete(from, to)
      if (tr.doc.childCount < 2) {
        tr.insert(tr.doc.content.size, nodes.paragraph.create())
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }

const insertParagraphAfter =
  (pos: number): Command =>
  (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (!node || node.type === nodes.title) return false
    if (dispatch) {
      const insertAt = pos + node.nodeSize
      const isListItem = listItemTypes.has(node.type)
      const block = isListItem
        ? node.type.create(null, nodes.paragraph.create())
        : nodes.paragraph.create()
      const tr = state.tr.insert(insertAt, block)
      tr.setSelection(
        TextSelection.create(tr.doc, insertAt + (isListItem ? 2 : 1))
      )
      dispatch(tr.scrollIntoView())
    }
    return true
  }

const selectBlockStart =
  (pos: number): Command =>
  (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (!node) return false
    if (dispatch) {
      const selection = node.isLeaf
        ? NodeSelection.create(state.doc, pos)
        : Selection.findFrom(state.doc.resolve(pos + 1), 1, true)
      if (!selection) return false
      dispatch(state.tr.setSelection(selection))
    }
    return true
  }

const blockKindAt = (state: EditorState, pos: number) => {
  let kind: BlockKind | null = null
  selectBlockStart(pos)(state, (tr) => {
    kind = activeBlockKind(state.apply(tr))
  })
  return kind as BlockKind | null
}

const toggleTaskAt =
  (pos: number): Command =>
  (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (node?.type !== nodes.task_item) return false
    if (dispatch) {
      dispatch(state.tr.setNodeAttribute(pos, "checked", !node.attrs.checked))
    }
    return true
  }

const toggleTask: Command = (state, dispatch) => {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === nodes.task_item) {
      return toggleTaskAt($from.before(depth))(state, dispatch)
    }
  }
  return false
}

const toggleCollapsibleAt =
  (pos: number): Command =>
  (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (node?.type !== nodes.collapsible) return false
    if (dispatch) {
      dispatch(state.tr.setNodeAttribute(pos, "open", !node.attrs.open))
    }
    return true
  }

const isMarkActive = (state: EditorState, type: MarkType) => {
  const { from, $from, to, empty } = state.selection
  if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()))
  return state.doc.rangeHasMark(from, to, type)
}

const toggleFormat =
  (type: MarkType): Command =>
  (state, dispatch) =>
    isInTitle(state) ? false : toggleMark(type)(state, dispatch)

const linkRange = (state: EditorState) => {
  const { $from, from, to, empty } = state.selection
  if (!empty) return { from, to }
  const parent = $from.parent
  const index = $from.index()
  const link = marks.link.isInSet(parent.maybeChild(index)?.marks ?? [])
  if (!link) return null
  const sameLink = (i: number) => link.isInSet(parent.child(i).marks)
  let first = index
  let last = index
  while (first > 0 && sameLink(first - 1)) first--
  while (last < parent.childCount - 1 && sameLink(last + 1)) last++
  let start = $from.start()
  for (let i = 0; i < first; i++) start += parent.child(i).nodeSize
  let end = start
  for (let i = first; i <= last; i++) end += parent.child(i).nodeSize
  return { from: start, to: end }
}

const activeLinkHref = (state: EditorState) => {
  const { $from, from, to, empty } = state.selection
  const found = empty
    ? marks.link.isInSet(state.storedMarks ?? $from.marks())
    : null
  if (found) return found.attrs.href as string
  let href: string | null = null
  state.doc.nodesBetween(from, Math.max(to, from + 1), (node) => {
    const link = marks.link.isInSet(node.marks)
    if (link) href = link.attrs.href as string
  })
  return href
}

const setLink =
  (raw: string): Command =>
  (state, dispatch) => {
    if (isInTitle(state)) return false
    const range = linkRange(state)
    if (!range) return false
    const href = normalizeHref(raw)
    if (dispatch) {
      const tr = state.tr.removeMark(range.from, range.to, marks.link)
      if (href) tr.addMark(range.from, range.to, marks.link.create({ href }))
      dispatch(tr)
    }
    return true
  }

const indentListItem: Command = (state, dispatch) =>
  sinkListItem(nodes.list_item)(state, dispatch) ||
  sinkListItem(nodes.task_item)(state, dispatch)

const outdentListItem: Command = (state, dispatch) =>
  liftListItem(nodes.list_item)(state, dispatch) ||
  liftListItem(nodes.task_item)(state, dispatch)

export {
  Chain,
  activeBlockKind,
  activeLinkHref,
  blockKindAt,
  deleteBlockAt,
  duplicateBlockAt,
  indentListItem,
  insertDivider,
  insertParagraphAfter,
  isInTitle,
  isMarkActive,
  moveBlock,
  moveBlockAt,
  movableBlockPos,
  outdentListItem,
  selectBlockStart,
  setLink,
  toggleCollapsibleAt,
  toggleFormat,
  toggleTask,
  toggleTaskAt,
  turnInto,
}
