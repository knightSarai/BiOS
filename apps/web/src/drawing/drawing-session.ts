import {
  applyChanges,
  drawingsOf,
  ensureDrawing,
  readShapes,
} from "@knight-os/drawing"
import type { DrawingMap, Shape, ShapeChange } from "@knight-os/drawing"
import * as Y from "yjs"

type DrawingSnapshot = {
  shapes: Shape[]
  canUndo: boolean
  canRedo: boolean
}

const TYPING_CAPTURE_MS = 600

const createDrawingSession = (ydoc: Y.Doc, drawingId: string) => {
  // Tags this editor's writes, so undo reverts them and never a sync from
  // another device.
  const origin = { drawingId }
  const listeners = new Set<() => void>()
  const drawings = drawingsOf(ydoc)
  let drawing: DrawingMap = ensureDrawing(ydoc, drawingId)
  let undoManager = new Y.UndoManager(drawing, {
    trackedOrigins: new Set([origin]),
    captureTimeout: TYPING_CAPTURE_MS,
  })

  const read = (): DrawingSnapshot => ({
    shapes: readShapes(drawing),
    canUndo: undoManager.canUndo(),
    canRedo: undoManager.canRedo(),
  })

  let snapshot = read()

  const refresh = () => {
    snapshot = read()
    for (const listener of listeners) listener()
  }

  const watch = () => {
    drawing.observeDeep(refresh)
    undoManager.on("stack-item-added", refresh)
    undoManager.on("stack-item-popped", refresh)
  }

  const unwatch = () => {
    drawing.unobserveDeep(refresh)
    undoManager.destroy()
  }

  // Two devices creating the same drawing at once keep only one map; follow
  // whichever one the document settled on instead of writing into the loser.
  const rebind = (event: Y.YMapEvent<DrawingMap>) => {
    if (!event.keysChanged.has(drawingId)) return
    const current = drawings.get(drawingId)
    if (current === drawing) return
    unwatch()
    drawing = current ?? ensureDrawing(ydoc, drawingId)
    undoManager = new Y.UndoManager(drawing, {
      trackedOrigins: new Set([origin]),
      captureTimeout: TYPING_CAPTURE_MS,
    })
    watch()
    refresh()
  }

  watch()
  drawings.observe(rebind)

  return {
    drawingId,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    // Typing in a label merges into one undo step; every other edit is its own.
    apply: (changes: readonly ShapeChange[], options = { typing: false }) => {
      if (!options.typing) undoManager.stopCapturing()
      applyChanges(drawing, changes, origin)
      if (!options.typing) undoManager.stopCapturing()
    },
    stopCapturing: () => {
      undoManager.stopCapturing()
    },
    undo: () => {
      undoManager.undo()
    },
    redo: () => {
      undoManager.redo()
    },
    destroy: () => {
      drawings.unobserve(rebind)
      unwatch()
      listeners.clear()
    },
  }
}

type DrawingSession = ReturnType<typeof createDrawingSession>

export { createDrawingSession }
export type { DrawingSession, DrawingSnapshot }
