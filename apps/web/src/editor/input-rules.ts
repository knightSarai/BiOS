import type { MarkType } from "prosemirror-model"
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules"
import { TextSelection } from "prosemirror-state"
import { findWrapping } from "prosemirror-transform"
import { marks, nodes } from "./schema"

const markRule = (pattern: RegExp, type: MarkType) =>
  new InputRule(pattern, (state, match, start, end) => {
    const [whole, prefix = "", content] = match
    if (!whole || !content) return null
    const $start = state.doc.resolve(start)
    if (!$start.parent.type.allowsMarkType(type)) return null
    if ($start.parent.type.spec.code) return null
    const delimiter = (whole.length - prefix.length - content.length) / 2
    const textStart = start + prefix.length
    const contentStart = textStart + delimiter
    const contentEnd = contentStart + content.length
    return state.tr
      .delete(contentEnd, end)
      .addMark(contentStart, contentEnd, type.create())
      .delete(textStart, contentStart)
      .removeStoredMark(type)
  })

const taskListRule = new InputRule(
  /^\s*\[( |x)?\]\s$/,
  (state, match, start, end) => {
    const $start = state.doc.resolve(start)
    if ($start.parent.type !== nodes.paragraph) return null
    const tr = state.tr.delete(start, end)
    const range = tr.doc.resolve(start).blockRange()
    const wrapping = range && findWrapping(range, nodes.task_list)
    if (!range || !wrapping) return null
    const checked = match[1] === "x"
    tr.wrap(
      range,
      wrapping.map((wrapper) =>
        wrapper.type === nodes.task_item
          ? { type: wrapper.type, attrs: { checked } }
          : wrapper
      )
    )
    return tr
  }
)

const dividerRule = new InputRule(/^---$/, (state, _match, start, end) => {
  const $start = state.doc.resolve(start)
  if ($start.parent.type !== nodes.paragraph || $start.depth !== 1) return null
  const blockStart = $start.before(1)
  const blockEnd = $start.after(1)
  const after = $start.parent.content.size - (end - start)
  if (after > 0) return null
  const divider = nodes.horizontal_rule.create()
  const tr = state.tr.replaceWith(blockStart, blockEnd, [
    divider,
    nodes.paragraph.create(),
  ])
  tr.setSelection(
    TextSelection.create(tr.doc, blockStart + divider.nodeSize + 1)
  )
  return tr
})

const editorInputRules = inputRules({
  rules: [
    textblockTypeInputRule(/^(#{1,3})\s$/, nodes.heading, (match) => ({
      level: match[1]?.length ?? 1,
    })),
    wrappingInputRule(/^\s*([-+*])\s$/, nodes.bullet_list),
    wrappingInputRule(
      /^(\d+)\.\s$/,
      nodes.ordered_list,
      (match) => ({ order: Number(match[1]) }),
      (match, node) =>
        node.childCount + (node.attrs.order as number) === Number(match[1])
    ),
    taskListRule,
    wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
    textblockTypeInputRule(
      /^```([a-z0-9-]*)\s$/,
      nodes.code_block,
      (match) => ({
        language: match[1] ?? "",
      })
    ),
    dividerRule,
    markRule(/(^|[^*])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, marks.strong),
    markRule(/(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, marks.em),
    markRule(/(^|[^_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, marks.em),
    markRule(/(^|[^~])~~([^~\s](?:[^~]*[^~\s])?)~~$/, marks.strike),
    markRule(/(^|[^`])`([^`]+)`$/, marks.code),
  ],
})

export { editorInputRules }
