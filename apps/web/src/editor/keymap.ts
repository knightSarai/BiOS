import {
  baseKeymap,
  chainCommands,
  exitCode,
  lift,
  setBlockType,
} from "prosemirror-commands"
import { keymap } from "prosemirror-keymap"
import { liftListItem, splitListItem } from "prosemirror-schema-list"
import { TextSelection, type Command } from "prosemirror-state"
import { redo, undo } from "y-prosemirror"
import { blockCatalog } from "./block-catalog"
import {
  indentListItem,
  moveBlock,
  outdentListItem,
  toggleFormat,
  toggleTask,
  turnInto,
} from "./commands"
import { marks, nodes, schema } from "./schema"

const titleEnter: Command = (state, dispatch) => {
  const { $from } = state.selection
  if ($from.parent.type !== nodes.title) return false
  if (dispatch) {
    const tr = state.tr.deleteSelection()
    const cursor = tr.selection.from
    const title = tr.doc.child(0)
    const titleEnd = title.nodeSize - 1
    const rest = tr.doc.textBetween(cursor, titleEnd)
    const next = tr.doc.child(1)
    if (!rest && next.type === nodes.paragraph && next.content.size === 0) {
      tr.setSelection(TextSelection.create(tr.doc, title.nodeSize + 1))
      dispatch(tr.scrollIntoView())
      return true
    }
    tr.delete(cursor, titleEnd)
    const insertAt = tr.doc.child(0).nodeSize
    tr.insert(
      insertAt,
      nodes.paragraph.create(null, rest ? schema.text(rest) : null)
    )
    tr.setSelection(TextSelection.create(tr.doc, insertAt + 1))
    dispatch(tr.scrollIntoView())
  }
  return true
}

const backspaceIntoTitle: Command = (state, dispatch) => {
  const { $cursor } = state.selection as TextSelection
  if (!$cursor || $cursor.parentOffset > 0 || $cursor.depth !== 1) return false
  if ($cursor.index(0) !== 1) return false
  if (dispatch) {
    const block = $cursor.parent
    const tr = state.tr
    const isRemovable =
      block.type === nodes.paragraph &&
      block.content.size === 0 &&
      state.doc.childCount > 2
    if (isRemovable) tr.delete($cursor.before(), $cursor.after())
    tr.setSelection(TextSelection.create(tr.doc, tr.doc.child(0).nodeSize - 1))
    dispatch(tr.scrollIntoView())
  }
  return true
}

const resetBlockAtStart: Command = (state, dispatch) => {
  const { $cursor } = state.selection as TextSelection
  if (!$cursor || $cursor.parentOffset > 0) return false
  const parent = $cursor.parent
  if (parent.type === nodes.heading || parent.type === nodes.code_block) {
    return setBlockType(nodes.paragraph)(state, dispatch)
  }
  if ($cursor.depth < 2 || $cursor.index(-1) !== 0) return false
  const wrapper = $cursor.node(-1).type
  if (wrapper === nodes.list_item || wrapper === nodes.task_item) {
    return liftListItem(wrapper)(state, dispatch)
  }
  if (wrapper === nodes.blockquote || wrapper === nodes.collapsible) {
    return lift(state, dispatch)
  }
  return false
}

const insertHardBreak: Command = (state, dispatch) => {
  if (state.selection.$from.parent.type.spec.code) return false
  if (state.selection.$from.parent.type === nodes.title) return true
  if (dispatch) {
    dispatch(
      state.tr.replaceSelectionWith(nodes.hard_break.create()).scrollIntoView()
    )
  }
  return true
}

const indentInCode: Command = (state, dispatch) => {
  if (!state.selection.$from.parent.type.spec.code) return false
  if (dispatch) dispatch(state.tr.insertText("  "))
  return true
}

const blockShortcuts = Object.fromEntries(
  blockCatalog.map((item) => [item.keys, turnInto(item.kind)])
)

const editorKeymap = keymap({
  ...blockShortcuts,
  "Mod-z": undo,
  "Mod-y": redo,
  "Mod-Shift-z": redo,
  "Mod-b": toggleFormat(marks.strong),
  "Mod-i": toggleFormat(marks.em),
  "Mod-e": toggleFormat(marks.code),
  "Mod-Shift-x": toggleFormat(marks.strike),
  Enter: chainCommands(
    titleEnter,
    splitListItem(nodes.list_item),
    splitListItem(nodes.task_item, { checked: false })
  ),
  "Shift-Enter": chainCommands(exitCode, insertHardBreak),
  "Mod-Enter": chainCommands(toggleTask, exitCode),
  Backspace: chainCommands(resetBlockAtStart, backspaceIntoTitle),
  Tab: chainCommands(indentInCode, indentListItem),
  "Shift-Tab": outdentListItem,
  "Alt-ArrowUp": moveBlock(-1),
  "Alt-ArrowDown": moveBlock(1),
})

const editorBaseKeymap = keymap(baseKeymap)

export { editorBaseKeymap, editorKeymap }
