import {
  Plugin,
  PluginKey,
  type Command,
  type EditorState,
} from "prosemirror-state"
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view"
import type { MentionBridge, MentionCandidate } from "./mention-bridge"
import { nodes, schema } from "./schema"

type MentionState = {
  from: number
  query: string
  index: number
}

type MentionAction =
  | { type: "open"; from: number }
  | { type: "close" }
  | { type: "index"; index: number }

const MAX_QUERY_LENGTH = 40

const mentionKey = new PluginKey<MentionState | null>("mention")

const readMention = (state: EditorState) => mentionKey.getState(state) ?? null

const nextMentionState = (
  mention: MentionState,
  state: EditorState
): MentionState | null => {
  const { selection } = state
  if (!selection.empty) return null
  const cursor = selection.from
  if (cursor <= mention.from) return null
  if (state.doc.resolve(mention.from).parent !== selection.$from.parent) {
    return null
  }
  if (state.doc.textBetween(mention.from, mention.from + 1) !== "@") return null
  const query = state.doc.textBetween(mention.from + 1, cursor)
  if (
    query.startsWith(" ") ||
    query.includes("  ") ||
    query.length > MAX_QUERY_LENGTH
  ) {
    return null
  }
  return {
    from: mention.from,
    query,
    index: query === mention.query ? mention.index : 0,
  }
}

const canOpenMention = (state: EditorState, from: number) => {
  const $from = state.doc.resolve(from)
  const parent = $from.parent
  if (parent.type === nodes.title || parent.type.spec.code) return false
  const before = parent.textBetween(0, $from.parentOffset, undefined, " ")
  return before === "" || /\s$/.test(before)
}

const closeMention = (view: EditorView) => {
  view.dispatch(view.state.tr.setMeta(mentionKey, { type: "close" }))
}

const setMentionIndex = (view: EditorView, index: number) => {
  view.dispatch(view.state.tr.setMeta(mentionKey, { type: "index", index }))
}

const applyMention =
  (candidate: MentionCandidate): Command =>
  (state, dispatch) => {
    const mention = readMention(state)
    if (!mention) return false
    const node =
      candidate.kind === "document"
        ? nodes.mention.create({
            targetKind: "document",
            targetId: candidate.id,
          })
        : nodes.activity.create({ activityId: candidate.id })
    if (dispatch) {
      const tr = state.tr.replaceWith(mention.from, state.selection.from, [
        node,
        schema.text(" "),
      ])
      dispatch(tr.setMeta(mentionKey, { type: "close" }).scrollIntoView())
    }
    return true
  }

const mentionPlugin = (bridge: MentionBridge) =>
  new Plugin<MentionState | null>({
    key: mentionKey,
    state: {
      init: () => null,
      apply(tr, value, _oldState, newState) {
        const action = tr.getMeta(mentionKey) as MentionAction | undefined
        let next = value
        if (next) {
          next = nextMentionState(
            { ...next, from: tr.mapping.map(next.from, 1) },
            newState
          )
        }
        switch (action?.type) {
          case "open":
            return nextMentionState(
              { from: action.from, query: "", index: 0 },
              newState
            )
          case "close":
            return null
          case "index":
            return next ? { ...next, index: action.index } : next
          default:
            return next
        }
      },
    },
    props: {
      decorations(state) {
        const mention = readMention(state)
        if (!mention) return null
        return DecorationSet.create(state.doc, [
          Decoration.inline(mention.from, state.selection.from, {
            class: "rounded-sm bg-muted",
          }),
        ])
      },
      handleTextInput(view, from, to, text) {
        if (text !== "@" || !canOpenMention(view.state, from)) return false
        const tr = view.state.tr.insertText(text, from, to)
        view.dispatch(tr.setMeta(mentionKey, { type: "open", from }))
        return true
      },
      handleKeyDown(view, event) {
        const mention = readMention(view.state)
        if (!mention) return false
        const candidates = bridge.search(mention.query)
        const move = (delta: number) => {
          const count = Math.max(candidates.length, 1)
          setMentionIndex(view, (mention.index + delta + count) % count)
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
            const candidate = candidates[mention.index]
            if (!candidate) {
              closeMention(view)
              return event.key === "Tab"
            }
            applyMention(candidate)(view.state, view.dispatch)
            return true
          }
          case "Escape":
            closeMention(view)
            return true
          default:
            return false
        }
      },
      handleDOMEvents: {
        blur(view) {
          if (readMention(view.state)) closeMention(view)
          return false
        },
      },
    },
  })

export {
  applyMention,
  closeMention,
  mentionKey,
  mentionPlugin,
  readMention,
  setMentionIndex,
}
export type { MentionState }
