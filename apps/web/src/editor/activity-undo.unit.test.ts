import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import { trackActivityUndo } from "./activity-undo"

const setup = () => {
  const ydoc = new Y.Doc()
  const text = ydoc.getText("body")
  const undoManager = new Y.UndoManager(text)
  const tracking = trackActivityUndo(undoManager)
  const reversals: ReturnType<typeof tracking.reversed>[] = []
  text.observe(() => {
    if (undoManager.undoing || undoManager.redoing) {
      reversals.push(tracking.reversed())
    }
  })
  const create = (value: string, ids: string[]) => {
    tracking.startCreation()
    text.insert(text.length, value)
    tracking.finishCreation(ids)
  }
  return { text, undoManager, tracking, reversals, create }
}

describe("trackActivityUndo", () => {
  it("hands the created ids back on undo, redo and undo again", () => {
    const { undoManager, reversals, create } = setup()
    create("chip", ["act-1", "act-2"])
    undoManager.undo()
    undoManager.redo()
    undoManager.undo()
    expect(reversals).toEqual([
      { direction: "undo", activityIds: ["act-1", "act-2"] },
      { direction: "redo", activityIds: ["act-1", "act-2"] },
      { direction: "undo", activityIds: ["act-1", "act-2"] },
    ])
  })

  it("ignores a chip deleted by hand, and the undo and redo of that deletion", () => {
    const { text, undoManager, reversals, create } = setup()
    create("chip", ["act-1"])
    undoManager.stopCapturing()
    text.delete(0, text.length)
    undoManager.undo()
    undoManager.redo()
    expect(reversals).toEqual([null, null])
  })

  it("ignores ordinary edits such as a paste", () => {
    const { text, undoManager, reversals } = setup()
    text.insert(0, "pasted chip")
    undoManager.undo()
    expect(reversals).toEqual([null])
  })

  it("keeps typing before a conversion out of the conversion's undo step", () => {
    const { text, undoManager, create } = setup()
    text.insert(0, "typed ")
    create("chip", ["act-1"])
    undoManager.undo()
    expect(text.toJSON()).toBe("typed ")
  })
})
