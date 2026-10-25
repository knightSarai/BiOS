import type { Node } from "prosemirror-model"
import {
  Plugin,
  PluginKey,
  TextSelection,
  type Command,
  type EditorState,
} from "prosemirror-state"
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view"
import { filterBlockCatalog, type BlockKind } from "./block-catalog"
import {
  Chain,
  insertParagraphAfter,
  movableBlockPos,
  turnInto,
} from "./commands"
import { nodes } from "./schema"

type SlashState = {
  from: number
  query: string
  index: number
}

type EditorUiState = {
  focused: boolean
  pointerDown: boolean
  hoverPos: number | null
  flashPos: number | null
  slash: SlashState | null
}

type EditorUiAction =
  | { type: "focus"; focused: boolean }
  | { type: "pointer"; down: boolean }
  | { type: "hover"; pos: number | null }
  | { type: "flash"; pos: number | null }
  | { type: "slash-open"; from: number }
  | { type: "slash-close" }
  | { type: "slash-index"; index: number }

const editorUiKey = new PluginKey<EditorUiState>("editorUi")

const initialUiState: EditorUiState = {
  focused: false,
  pointerDown: false,
  hoverPos: null,
  flashPos: null,
  slash: null,
}

const readUi = (state: EditorState) =>
  editorUiKey.getState(state) ?? initialUiState

const slashItems = (slash: SlashState) => filterBlockCatalog(slash.query)

const nextSlashState = (slash: SlashState, state: EditorState) => {
  const { selection } = state
  if (!selection.empty) return null
  const cursor = selection.from
  if (cursor <= slash.from) return null
  const $from = state.doc.resolve(slash.from)
  if ($from.parent !== selection.$from.parent) return null
  if (state.doc.textBetween(slash.from, slash.from + 1) !== "/") return null
  const query = state.doc.textBetween(slash.from + 1, cursor)
  if (query.startsWith(" ") || query.includes("  ") || query.length > 32) {
    return null
  }
  const count = filterBlockCatalog(query).length
  const index = query === slash.query ? slash.index : 0
  return {
    from: slash.from,
    query,
    index: Math.min(index, Math.max(count - 1, 0)),
  }
}

const canOpenSlash = (state: EditorState, from: number) => {
  const $from = state.doc.resolve(from)
  const parent = $from.parent
  if (parent.type === nodes.title || parent.type.spec.code) return false
  const before = parent.textBetween(0, $from.parentOffset, undefined, " ")
  return before === "" || /\s$/.test(before)
}

const blockPosAt = (state: EditorState, pos: number, inside: number) => {
  const target = inside >= 0 ? inside : pos
  const $pos = state.doc.resolve(target)
  if ($pos.depth === 0) {
    const after = $pos.nodeAfter
    return after && after.type !== nodes.title ? target : null
  }
  for (let depth = $pos.depth; depth > 0; depth--) {
    const type = $pos.node(depth).type
    if (type === nodes.list_item || type === nodes.task_item) {
      return $pos.before(depth)
    }
    if (depth === 1) return type === nodes.title ? null : $pos.before(1)
  }
  return null
}

const placeholderFor = (node: Node, isOnlyBlock: boolean) => {
  if (node.type === nodes.heading)
    return `Heading ${node.attrs.level as number}`
  if (node.type !== nodes.paragraph) return null
  return isOnlyBlock
    ? "Start writing, or type / for commands"
    : "Type / for commands"
}

const placeholders = (state: EditorState, focused: boolean) => {
  const decorations: Decoration[] = []
  const { doc, selection } = state
  const title = doc.child(0)
  if (title.content.size === 0) {
    decorations.push(
      Decoration.node(0, title.nodeSize, { "data-placeholder": "Untitled" })
    )
  }

  const isOnlyBlock =
    doc.childCount === 2 && doc.child(1).type === nodes.paragraph
  const first = doc.child(1)
  if (isOnlyBlock && first.content.size === 0) {
    const text = placeholderFor(first, true)
    if (text) {
      decorations.push(
        Decoration.node(title.nodeSize, title.nodeSize + first.nodeSize, {
          "data-placeholder": text,
        })
      )
    }
    return decorations
  }

  const { $from } = selection
  if (!focused || !selection.empty || $from.parent.content.size > 0) {
    return decorations
  }
  const text = placeholderFor($from.parent, false)
  if (text && $from.depth > 0) {
    decorations.push(
      Decoration.node($from.before(), $from.after(), {
        "data-placeholder": text,
      })
    )
  }
  return decorations
}

const editorUiPlugin = new Plugin<EditorUiState>({
  key: editorUiKey,
  state: {
    init: () => initialUiState,
    apply(tr, value, _oldState, newState) {
      const action = tr.getMeta(editorUiKey) as EditorUiAction | undefined
      let next: EditorUiState = value

      if (tr.docChanged && value.hoverPos !== null) {
        const mapped = tr.mapping.mapResult(value.hoverPos, 1)
        next = { ...next, hoverPos: mapped.deleted ? null : mapped.pos }
      }
      if (tr.docChanged && next.flashPos !== null) {
        const mapped = tr.mapping.mapResult(next.flashPos, 1)
        next = { ...next, flashPos: mapped.deleted ? null : mapped.pos }
      }
      if (next.slash) {
        const from = tr.mapping.map(next.slash.from, 1)
        next = {
          ...next,
          slash: nextSlashState({ ...next.slash, from }, newState),
        }
      }

      switch (action?.type) {
        case "focus":
          return {
            ...next,
            focused: action.focused,
            slash: action.focused ? next.slash : null,
          }
        case "pointer":
          return { ...next, pointerDown: action.down }
        case "hover":
          return { ...next, hoverPos: action.pos }
        case "flash":
          return { ...next, flashPos: action.pos }
        case "slash-open":
          return {
            ...next,
            slash: nextSlashState(
              { from: action.from, query: "", index: 0 },
              newState
            ),
          }
        case "slash-close":
          return { ...next, slash: null }
        case "slash-index":
          return next.slash
            ? { ...next, slash: { ...next.slash, index: action.index } }
            : next
        default:
          return next
      }
    },
  },
  props: {
    decorations(state) {
      const ui = readUi(state)
      const decorations = placeholders(state, ui.focused)
      const flashed =
        ui.flashPos === null ? null : state.doc.nodeAt(ui.flashPos)
      if (ui.flashPos !== null && flashed) {
        decorations.push(
          Decoration.node(ui.flashPos, ui.flashPos + flashed.nodeSize, {
            class: "rounded-sm bg-selection transition-colors duration-700",
          })
        )
      }
      if (ui.slash) {
        decorations.push(
          Decoration.inline(ui.slash.from, state.selection.from, {
            class: "rounded-sm bg-muted",
          })
        )
      }
      return DecorationSet.create(state.doc, decorations)
    },
    handleTextInput(view, from, to, text) {
      if (text !== "/" || !canOpenSlash(view.state, from)) return false
      const tr = view.state.tr.insertText(text, from, to)
      view.dispatch(tr.setMeta(editorUiKey, { type: "slash-open", from }))
      return true
    },
    handleKeyDown(view, event) {
      const { slash } = readUi(view.state)
      if (!slash) return false
      const items = slashItems(slash)
      const move = (delta: number) => {
        const count = Math.max(items.length, 1)
        const index = (slash.index + delta + count) % count
        view.dispatch(
          view.state.tr.setMeta(editorUiKey, { type: "slash-index", index })
        )
      }
      switch (event.key) {
        case "ArrowDown":
          move(1)
          return true
        case "ArrowUp":
          move(-1)
          return true
        case "Enter":
        case "Tab": {
          const item = items[slash.index]
          if (!item) {
            view.dispatch(
              view.state.tr.setMeta(editorUiKey, { type: "slash-close" })
            )
            return event.key === "Tab"
          }
          applySlashItem(item.kind)(view.state, view.dispatch)
          return true
        }
        case "Escape":
          view.dispatch(
            view.state.tr.setMeta(editorUiKey, { type: "slash-close" })
          )
          return true
        default:
          return false
      }
    },
    handleDOMEvents: {
      focus(view) {
        view.dispatch(
          view.state.tr.setMeta(editorUiKey, { type: "focus", focused: true })
        )
        return false
      },
      blur(view) {
        view.dispatch(
          view.state.tr.setMeta(editorUiKey, { type: "focus", focused: false })
        )
        return false
      },
      mousedown(view, event) {
        if (event.button !== 0) return false
        view.dispatch(
          view.state.tr.setMeta(editorUiKey, { type: "pointer", down: true })
        )
        view.dom.ownerDocument.addEventListener(
          "mouseup",
          () => {
            if (view.isDestroyed) return
            view.dispatch(
              view.state.tr.setMeta(editorUiKey, {
                type: "pointer",
                down: false,
              })
            )
          },
          { once: true }
        )
        return false
      },
      mousemove(view, event) {
        const hit = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })
        const pos = hit ? blockPosAt(view.state, hit.pos, hit.inside) : null
        if (pos !== readUi(view.state).hoverPos) setHoverPos(view, pos)
        return false
      },
    },
  },
})

const setFlashPos = (view: EditorView, pos: number | null) => {
  view.dispatch(view.state.tr.setMeta(editorUiKey, { type: "flash", pos }))
}

const setHoverPos = (view: EditorView, pos: number | null) => {
  view.dispatch(view.state.tr.setMeta(editorUiKey, { type: "hover", pos }))
}

const applySlashItem =
  (kind: BlockKind): Command =>
  (state, dispatch) => {
    const { slash } = readUi(state)
    if (!slash) return false
    const chain = new Chain(state)
    chain.run((current, run) => {
      run?.(current.tr.delete(slash.from, current.selection.from))
      return true
    })
    chain.run(turnInto(kind))
    chain.tr.setMeta(editorUiKey, { type: "slash-close" })
    return dispatch ? chain.dispatch(dispatch) : true
  }

const openSlashMenu: Command = (state, dispatch) => {
  const { from, to } = state.selection
  const $from = state.doc.resolve(from)
  if ($from.parent.type === nodes.title || $from.parent.type.spec.code)
    return false
  if (dispatch) {
    const needsSpace = !canOpenSlash(state, from)
    const tr = state.tr.insertText(needsSpace ? " /" : "/", from, to)
    const slashPos = from + (needsSpace ? 1 : 0)
    tr.setSelection(TextSelection.create(tr.doc, slashPos + 1))
    dispatch(tr.setMeta(editorUiKey, { type: "slash-open", from: slashPos }))
  }
  return true
}

const openInsertMenu: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  const isEmptyBlock =
    empty && $from.parent.isTextblock && $from.parent.content.size === 0
  const pos = movableBlockPos(state)
  if (isEmptyBlock || pos === null) return openSlashMenu(state, dispatch)
  const chain = new Chain(state)
  chain.run(insertParagraphAfter(pos))
  const from = chain.state.selection.from
  chain.run((current, run) => {
    run?.(current.tr.insertText("/", from))
    return true
  })
  chain.tr.setMeta(editorUiKey, { type: "slash-open", from })
  return dispatch ? chain.dispatch(dispatch) : true
}

const closeSlashMenu = (view: EditorView) => {
  view.dispatch(view.state.tr.setMeta(editorUiKey, { type: "slash-close" }))
}

const setSlashIndex = (view: EditorView, index: number) => {
  view.dispatch(
    view.state.tr.setMeta(editorUiKey, { type: "slash-index", index })
  )
}

export {
  applySlashItem,
  closeSlashMenu,
  editorUiKey,
  editorUiPlugin,
  openInsertMenu,
  openSlashMenu,
  readUi,
  setFlashPos,
  setHoverPos,
  setSlashIndex,
  slashItems,
}
export type { EditorUiState, SlashState }
