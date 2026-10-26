import type { UndoManager } from "yjs"

type StackItem = UndoManager["undoStack"][number]

const CREATED_ACTIVITIES = "createdActivityIds"

const createdIdsOf = (item: StackItem | null | undefined) => {
  const ids: unknown = item?.meta.get(CREATED_ACTIVITIES)
  return Array.isArray(ids) ? (ids as string[]) : null
}

// Undo and redo hand activities back and forth only for the history entry that
// created them, so a chip deleted, cut or pasted by hand never deletes its activity.
const trackActivityUndo = (undoManager: UndoManager) => {
  const carryAcross = ({ stackItem }: { stackItem: StackItem }) => {
    if (!undoManager.undoing && !undoManager.redoing) return
    const ids = createdIdsOf(undoManager.currStackItem)
    if (ids) stackItem.meta.set(CREATED_ACTIVITIES, ids)
  }
  undoManager.on("stack-item-added", carryAcross)
  let stackSizeBeforeCreation: number | null = null

  return {
    startCreation: () => {
      undoManager.stopCapturing()
      stackSizeBeforeCreation = undoManager.undoStack.length
    },
    finishCreation: (activityIds: string[]) => {
      const grew =
        stackSizeBeforeCreation !== null &&
        undoManager.undoStack.length > stackSizeBeforeCreation
      stackSizeBeforeCreation = null
      const item = grew ? undoManager.undoStack.at(-1) : undefined
      if (item) {
        item.meta.set(CREATED_ACTIVITIES, [
          ...(createdIdsOf(item) ?? []),
          ...activityIds,
        ])
      }
      undoManager.stopCapturing()
    },
    reversed: () => {
      const ids = createdIdsOf(undoManager.currStackItem)
      if (!ids) return null
      return {
        activityIds: ids,
        direction: undoManager.undoing ? ("undo" as const) : ("redo" as const),
      }
    },
    destroy: () => undoManager.off("stack-item-added", carryAcross),
  }
}

type ActivityUndoTracking = ReturnType<typeof trackActivityUndo>

export { trackActivityUndo }
export type { ActivityUndoTracking }
