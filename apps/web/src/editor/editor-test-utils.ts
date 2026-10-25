import type { Node } from "prosemirror-model"
import {
  EditorState,
  TextSelection,
  type Command,
  type Plugin,
  type Transaction,
} from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { schema } from "./schema"

const text = (value: string) => (value ? [schema.text(value)] : [])

const title = (value = "Title") => schema.node("title", null, text(value))
const p = (value = "") => schema.node("paragraph", null, text(value))
const h = (level: number, value: string) =>
  schema.node("heading", { level }, text(value))
const li = (value: string) => schema.node("list_item", null, [p(value)])
const task = (value: string, checked = false) =>
  schema.node("task_item", { checked }, [p(value)])
const ul = (...items: Node[]) => schema.node("bullet_list", null, items)
const ol = (...items: Node[]) => schema.node("ordered_list", null, items)
const tasks = (...items: Node[]) => schema.node("task_list", null, items)
const quote = (...paragraphs: Node[]) =>
  schema.node("blockquote", null, paragraphs)
const hr = () => schema.node("horizontal_rule")
const doc = (...blocks: Node[]) =>
  schema.node(
    "doc",
    null,
    [blocks[0]?.type.name === "title" ? [] : title(), blocks].flat()
  )

const findText = (node: Node, value: string) => {
  const found: number[] = []
  node.descendants((child, pos) => {
    if (found.length > 0) return false
    if (child.isText && child.text?.includes(value)) {
      found.push(pos + (child.text.indexOf(value) ?? 0))
    }
    return true
  })
  const pos = found[0]
  if (pos === undefined) throw new Error(`Text not found: ${value}`)
  return pos
}

type TestView = EditorView & { state: EditorState }

const createView = (
  node: Node,
  cursor: number | string = 1,
  plugins: Plugin[] = []
): TestView => {
  const pos =
    typeof cursor === "string" ? findText(node, cursor) + cursor.length : cursor
  const state = EditorState.create({
    schema,
    doc: node,
    plugins,
    selection: TextSelection.create(node, pos),
  })
  const view = {
    state,
    composing: false,
    isDestroyed: false,
    dispatch(tr: Transaction) {
      view.state = view.state.apply(tr)
    },
  }
  return view as unknown as TestView
}

const run = (view: TestView, command: Command) =>
  command(view.state, view.dispatch)

const typeText = (view: TestView, value: string) => {
  for (const char of value) {
    const { from, to } = view.state.selection
    const fallback = () => view.state.tr.insertText(char, from, to)
    const handled = view.state.plugins.some((plugin) =>
      plugin.props.handleTextInput?.call(plugin, view, from, to, char, fallback)
    )
    if (!handled) view.dispatch(fallback())
  }
}

type Modifiers = Partial<
  Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">
>

const pressKey = (view: TestView, key: string, modifiers: Modifiers = {}) => {
  const event = {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  } as KeyboardEvent
  return view.state.plugins.some((plugin) =>
    plugin.props.handleKeyDown?.call(plugin, view, event)
  )
}

const blockNames = (node: Node) => {
  const names: string[] = []
  node.forEach((child) => names.push(child.type.name))
  return names
}

export {
  blockNames,
  createView,
  doc,
  findText,
  h,
  hr,
  li,
  ol,
  p,
  pressKey,
  quote,
  run,
  task,
  tasks,
  title,
  typeText,
  ul,
}
export type { TestView }
