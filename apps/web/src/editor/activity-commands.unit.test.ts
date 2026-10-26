import { NodeSelection, TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import type { ActivityDraft } from "./activity-bridge"
import { convertToActivities, onSelectedActivity } from "./activity-commands"
import { blockIdsPlugin } from "./block-ids"
import {
  blockNames,
  createView,
  doc,
  findText,
  li,
  p,
  run,
  task,
  tasks,
  ul,
} from "./editor-test-utils"
import { nodes, schema } from "./schema"

const convert = (view: ReturnType<typeof createView>) => {
  const drafts: ActivityDraft[] = []
  let next = 0
  const ran = run(
    view,
    convertToActivities(
      () => `activity-${++next}`,
      (created) => drafts.push(...created)
    )
  )
  return { ran, drafts }
}

const activityIdsIn = (node: ReturnType<typeof doc>) => {
  const ids: string[] = []
  node.descendants((child) => {
    if (child.type === nodes.activity) {
      ids.push(child.attrs.activityId as string)
    }
  })
  return ids
}

const select = (
  view: ReturnType<typeof createView>,
  from: string,
  to: string
) => {
  const start = view.state.doc
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(
        start,
        findText(start, from),
        findText(start, to) + to.length
      )
    )
  )
}

describe("convertToActivities", () => {
  it("turns the line under the cursor into an activity chip", () => {
    const view = createView(doc(p("Book a sparring session")), "Book")
    const { ran, drafts } = convert(view)
    expect(ran).toBe(true)
    expect(drafts).toEqual([
      expect.objectContaining({
        activityId: "activity-1",
        title: "Book a sparring session",
        status: "todo",
      }),
    ])
    expect(view.state.doc.child(1).textContent).toBe("")
    expect(activityIdsIn(view.state.doc)).toEqual(["activity-1"])
  })

  it("creates one activity per selected line, in document order", () => {
    const view = createView(doc(ul(li("One"), li("Two"), li("Three"))))
    select(view, "One", "Three")
    const { drafts } = convert(view)
    expect(drafts.map((draft) => draft.title)).toEqual(["One", "Two", "Three"])
    expect(blockNames(view.state.doc)).toEqual(["title", "bullet_list"])
    expect(activityIdsIn(view.state.doc)).toHaveLength(3)
  })

  it("carries a ticked checklist item over as done and drops the checkbox", () => {
    const view = createView(
      doc(tasks(task("Buy wraps", true), task("Weigh in")))
    )
    select(view, "Buy wraps", "Weigh in")
    const { drafts } = convert(view)
    expect(drafts.map((draft) => [draft.title, draft.status])).toEqual([
      ["Buy wraps", "done"],
      ["Weigh in", "todo"],
    ])
    expect(blockNames(view.state.doc)).toEqual(["title", "bullet_list"])
  })

  it("keeps the source block id so the activity can link back to it", () => {
    const view = createView(
      doc(schema.node("paragraph", { id: "block-7" }, [schema.text("Spar")])),
      "Spar"
    )
    const { drafts } = convert(view)
    expect(drafts[0]?.blockId).toBe("block-7")
  })

  it("turns only the selected words into an activity and keeps the rest", () => {
    const view = createView(doc(p("Call the coach tomorrow morning")))
    select(view, "Call", "coach")
    const { drafts } = convert(view)
    expect(drafts.map((draft) => draft.title)).toEqual(["Call the coach"])
    const line = view.state.doc.child(1)
    expect(line.child(0).type).toBe(nodes.activity)
    expect(line.textContent).toBe(" tomorrow morning")
  })

  it("leaves surrounding spaces outside the chip", () => {
    const view = createView(doc(p("Buy  hand wraps  today")))
    const start = view.state.doc
    const from = findText(start, "Buy") + 3
    const to = findText(start, "today")
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(start, from, to))
    )
    const { drafts } = convert(view)
    expect(drafts[0]?.title).toBe("hand wraps")
    expect(view.state.doc.child(1).textContent).toBe("Buy    today")
  })

  it("uses the selected part of each line when the selection spans lines", () => {
    const view = createView(doc(p("One two"), p("Three four")))
    select(view, "two", "Three")
    const { drafts } = convert(view)
    expect(drafts.map((draft) => draft.title)).toEqual(["two", "Three"])
    expect(view.state.doc.child(1).textContent).toBe("One ")
    expect(view.state.doc.child(2).textContent).toBe(" four")
  })

  it("keeps a checklist item when only part of it is selected", () => {
    const view = createView(doc(tasks(task("Weigh in before breakfast", true))))
    select(view, "Weigh", "in")
    const { drafts } = convert(view)
    expect(drafts[0]).toMatchObject({ title: "Weigh in", status: "todo" })
    expect(blockNames(view.state.doc)).toEqual(["title", "task_list"])
    expect(view.state.doc.child(1).child(0).attrs.checked).toBe(true)
  })

  it("does nothing in the title", () => {
    expect(convert(createView(doc(p("Body")), 2)).ran).toBe(false)
  })

  it("does nothing on an empty line", () => {
    expect(convert(createView(doc(p()), 8)).ran).toBe(false)
  })

  it("does nothing on a line that already holds an activity", () => {
    const line = schema.node("paragraph", null, [
      nodes.activity.create({ activityId: "existing" }),
      schema.text(" note"),
    ])
    expect(convert(createView(doc(line), "note")).ran).toBe(false)
  })
})

describe("checklist conversion keeps the surrounding structure", () => {
  const collapsible = (...children: ReturnType<typeof p>[]) =>
    schema.node("collapsible", null, children)

  it("keeps converted items inside their collapsible section", () => {
    const view = createView(
      doc(collapsible(p("Summary"), tasks(task("A"), task("B"))))
    )
    select(view, "A", "B")
    convert(view)
    const section = view.state.doc.child(1)
    expect(section.type.name).toBe("collapsible")
    expect(blockNames(section)).toEqual(["paragraph", "bullet_list"])
  })

  it("keeps nested items under the converted one", () => {
    const parent = schema.node("task_item", null, [
      p("Parent"),
      tasks(task("Child one"), task("Child two")),
    ])
    const view = createView(doc(tasks(parent)), "Parent")
    convert(view)
    const item = view.state.doc.child(1).child(0)
    expect(item.type.name).toBe("list_item")
    expect(item.child(1).type.name).toBe("task_list")
    expect(item.child(1).childCount).toBe(2)
  })

  it("splits a checklist around a single converted item", () => {
    const view = createView(doc(tasks(task("A"), task("B"), task("C"))), "B")
    convert(view)
    expect(blockNames(view.state.doc)).toEqual([
      "title",
      "task_list",
      "bullet_list",
      "task_list",
    ])
  })

  it("does not merge into a separate list that follows", () => {
    const view = createView(doc(tasks(task("A")), ul(li("Other"))), "A")
    convert(view)
    expect(blockNames(view.state.doc)).toEqual([
      "title",
      "bullet_list",
      "bullet_list",
    ])
  })

  it("treats a later paragraph of a checked item as plain text", () => {
    const item = schema.node("task_item", { checked: true }, [
      p("Head"),
      p("Note"),
    ])
    const view = createView(doc(tasks(item)), "Note")
    const { drafts } = convert(view)
    expect(drafts[0]?.status).toBe("todo")
    expect(view.state.doc.child(1).type.name).toBe("task_list")
    expect(view.state.doc.child(1).child(0).attrs.checked).toBe(true)
  })

  it("keeps the line's block id so origin links still land on it", () => {
    const line = schema.node("paragraph", { id: "keep-me" }, [
      schema.text("Weigh in"),
    ])
    const view = createView(
      doc(tasks(schema.node("task_item", null, [line]))),
      "Weigh in",
      [blockIdsPlugin]
    )
    const { drafts } = convert(view)
    expect(drafts[0]?.blockId).toBe("keep-me")
    const paragraph = view.state.doc.child(1).child(0).child(0)
    expect(paragraph.attrs.id).toBe("keep-me")
  })
})

describe("selected activity chip", () => {
  it("runs the action for the selected chip only", () => {
    const line = schema.node("paragraph", null, [
      nodes.activity.create({ activityId: "act-1" }),
    ])
    const view = createView(doc(line), "")
    const opened: string[] = []
    const command = onSelectedActivity((id) => opened.push(id))
    expect(run(view, command)).toBe(false)
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, 8))
    )
    expect(run(view, command)).toBe(true)
    expect(opened).toEqual(["act-1"])
  })
})
