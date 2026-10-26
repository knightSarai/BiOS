import type { Node, NodeType } from "prosemirror-model"
import {
  NodeSelection,
  TextSelection,
  type Command,
  type EditorState,
  type Transaction,
} from "prosemirror-state"
import type { ActivityDraft } from "./activity-bridge"
import { nodes } from "./schema"

const ACTIVITY_CREATION_META = "createdActivityIds"

type ActivityTarget = {
  blockPos: number
  startOffset: number
  endOffset: number
  title: string
  checklistItemPos: number | null
}

const rangeHoldsActivity = (doc: Node, from: number, to: number) => {
  let found = false
  doc.nodesBetween(from, to, (node) => {
    if (node.type === nodes.activity) found = true
    return !found
  })
  return found
}

const checklistItemOf = (doc: Node, blockPos: number) => {
  const $block = doc.resolve(blockPos)
  const isFirstChildOfTask =
    $block.parent.type === nodes.task_item && $block.index() === 0
  return isFirstChildOfTask ? $block.before() : null
}

const targetIn = (
  doc: Node,
  block: Node,
  blockPos: number,
  from: number,
  to: number
): ActivityTarget | null => {
  if (block.type === nodes.title || block.type.spec.code) return null
  const contentStart = blockPos + 1
  const contentEnd = contentStart + block.content.size
  const rawStart = Math.max(from, contentStart)
  const rawEnd = Math.min(to, contentEnd)
  if (rawStart >= rawEnd) return null

  const text = doc.textBetween(rawStart, rawEnd, " ", " ")
  const title = text.trim()
  if (!title) return null
  const start = rawStart + (text.length - text.trimStart().length)
  const end = rawEnd - (text.length - text.trimEnd().length)
  if (rangeHoldsActivity(doc, start, end)) return null

  const wholeLine =
    !rangeHoldsActivity(doc, contentStart, contentEnd) &&
    doc.textBetween(contentStart, start, " ", " ").trim() === "" &&
    doc.textBetween(end, contentEnd, " ", " ").trim() === ""

  return {
    blockPos,
    startOffset: start - contentStart,
    endOffset: end - contentStart,
    title,
    checklistItemPos: wholeLine ? checklistItemOf(doc, blockPos) : null,
  }
}

const activityTargets = (state: EditorState) => {
  const { from, to, empty, $from } = state.selection
  if (empty) {
    const block = $from.parent
    if (!block.isTextblock) return []
    if (rangeHoldsActivity(block, 0, block.content.size)) return []
    const blockPos = $from.before()
    const target = targetIn(
      state.doc,
      block,
      blockPos,
      blockPos + 1,
      blockPos + 1 + block.content.size
    )
    return target ? [target] : []
  }
  const targets: ActivityTarget[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      const target = targetIn(state.doc, node, pos, from, to)
      if (target) targets.push(target)
    }
    return !node.isTextblock
  })
  return targets
}

const listRuns = (list: Node, converted: Set<number>) => {
  const runs: { type: NodeType; items: Node[] }[] = []
  list.forEach((item, _offset, index) => {
    const isConverted = converted.has(index)
    const type = isConverted ? nodes.bullet_list : nodes.task_list
    const node = isConverted
      ? nodes.list_item.create(
          { id: item.attrs.id as string | null },
          item.content
        )
      : item
    const last = runs.at(-1)
    if (last?.type === type) last.items.push(node)
    else runs.push({ type, items: [node] })
  })
  return runs.map((run, index) =>
    run.type.create(
      { id: index === 0 ? (list.attrs.id as string | null) : null },
      run.items
    )
  )
}

const uncheckChecklistItems = (tr: Transaction, itemPositions: number[]) => {
  const byList = new Map<number, Set<number>>()
  for (const itemPos of itemPositions) {
    const $item = tr.doc.resolve(tr.mapping.map(itemPos, 1))
    const listPos = $item.before()
    const indexes = byList.get(listPos) ?? new Set<number>()
    indexes.add($item.index())
    byList.set(listPos, indexes)
  }
  const listPositions = [...byList.keys()].sort((a, b) => b - a)
  for (const listPos of listPositions) {
    const list = tr.doc.nodeAt(listPos)
    const indexes = byList.get(listPos)
    if (list?.type !== nodes.task_list || !indexes) continue
    tr.replaceWith(listPos, listPos + list.nodeSize, listRuns(list, indexes))
  }
}

const findActivityPos = (doc: Node, activityId: string | undefined) => {
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found !== null) return false
    if (node.type === nodes.activity && node.attrs.activityId === activityId) {
      found = pos
    }
    return true
  })
  return found as number | null
}

const convertToActivities =
  (
    createId: () => string,
    onCreate: (drafts: ActivityDraft[]) => void
  ): Command =>
  (state, dispatch) => {
    const targets = activityTargets(state)
    if (targets.length === 0) return false
    if (!dispatch) return true

    const tr = state.tr
    const drafts: ActivityDraft[] = []
    const checklistItems: number[] = []

    for (const target of [...targets].reverse()) {
      const block = state.doc.nodeAt(target.blockPos)
      const contentStart = target.blockPos + 1
      const activityId = createId()
      const checklistItem =
        target.checklistItemPos === null
          ? null
          : state.doc.nodeAt(target.checklistItemPos)
      drafts.unshift({
        activityId,
        title: target.title,
        status: checklistItem?.attrs.checked ? "done" : "todo",
        blockId: (block?.attrs.id as string | null | undefined) ?? null,
      })
      tr.replaceWith(
        contentStart + target.startOffset,
        contentStart + target.endOffset,
        nodes.activity.create({ activityId })
      )
      if (target.checklistItemPos !== null) {
        checklistItems.push(target.checklistItemPos)
      }
    }

    uncheckChecklistItems(tr, checklistItems)
    const firstChip = findActivityPos(tr.doc, drafts[0]?.activityId)
    if (firstChip !== null) {
      tr.setSelection(TextSelection.create(tr.doc, firstChip + 1))
    }
    tr.setMeta(
      ACTIVITY_CREATION_META,
      drafts.map((draft) => draft.activityId)
    )
    dispatch(tr.scrollIntoView())
    onCreate(drafts)
    return true
  }

const selectedActivityId = (state: EditorState) => {
  const { selection } = state
  return selection instanceof NodeSelection &&
    selection.node.type === nodes.activity
    ? (selection.node.attrs.activityId as string)
    : null
}

const onSelectedActivity =
  (action: (activityId: string) => void): Command =>
  (state, dispatch) => {
    const activityId = selectedActivityId(state)
    if (!activityId) return false
    if (dispatch) action(activityId)
    return true
  }

const createActivitiesCommand = (create: (drafts: ActivityDraft[]) => void) =>
  convertToActivities(() => crypto.randomUUID(), create)

export {
  ACTIVITY_CREATION_META,
  activityTargets,
  convertToActivities,
  createActivitiesCommand,
  onSelectedActivity,
}
export type { ActivityTarget }
