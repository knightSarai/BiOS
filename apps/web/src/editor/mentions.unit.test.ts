import { describe, expect, it } from "vitest"
import {
  createView,
  doc,
  p,
  pressKey,
  title,
  typeText,
} from "./editor-test-utils"
import type { MentionBridge, MentionCandidate } from "./mention-bridge"
import { contentOf } from "./mention-index"
import { mentionPlugin, readMention } from "./mention-plugin"
import { schema } from "./schema"

const candidates: MentionCandidate[] = [
  {
    kind: "document",
    id: "doc-gym",
    title: "Gym options",
    icon: null,
    path: "Areas / Health",
  },
  {
    kind: "activity",
    id: "act-32",
    key: "HLT-32",
    title: "Book sparring",
    status: "todo",
  },
]

const bridge: MentionBridge = {
  search: (query) =>
    candidates.filter((candidate) =>
      candidate.title.toLowerCase().includes(query.toLowerCase())
    ),
  observe: () => () => {},
  preview: () => null,
  open: () => {},
}

const inlineNames = (view: ReturnType<typeof createView>) => {
  const names: string[] = []
  view.state.doc.child(1).forEach((node) => names.push(node.type.name))
  return names
}

describe("mention plugin", () => {
  it("opens on @ after a space and inserts the chosen document as a mention", () => {
    const view = createView(doc(title(), p("See ")), "See ", [
      mentionPlugin(bridge),
    ])
    typeText(view, "@gym")
    expect(readMention(view.state)).toMatchObject({ query: "gym", index: 0 })

    expect(pressKey(view, "Enter")).toBe(true)
    expect(readMention(view.state)).toBeNull()
    expect(inlineNames(view)).toEqual(["text", "mention", "text"])
    const mention = view.state.doc.child(1).child(1)
    expect(mention.attrs).toEqual({
      targetKind: "document",
      targetId: "doc-gym",
    })
  })

  it("inserts an activity as the existing activity chip", () => {
    const view = createView(doc(title(""), p("")), 3, [mentionPlugin(bridge)])
    typeText(view, "@spar")
    pressKey(view, "Enter")
    expect(view.state.doc.child(1).child(0).attrs).toEqual({
      activityId: "act-32",
    })
  })

  it("does not open inside a word, and closes on Escape", () => {
    const view = createView(doc(title(), p("mail")), "mail", [
      mentionPlugin(bridge),
    ])
    typeText(view, "@")
    expect(readMention(view.state)).toBeNull()

    const other = createView(doc(title(""), p("")), 3, [mentionPlugin(bridge)])
    typeText(other, "@g")
    pressKey(other, "Escape")
    expect(readMention(other.state)).toBeNull()
  })
})

describe("contentOf", () => {
  it("reads the title, the first line as excerpt, and every mention with its block", () => {
    const body = schema.node("paragraph", { id: "b1" }, [
      schema.text("Times fit around "),
      schema.node("mention", { targetKind: "document", targetId: "doc-plan" }),
      schema.text(" and "),
      schema.node("activity", { activityId: "act-32" }),
    ])
    const content = contentOf(doc(title("Gym options"), body))
    expect(content.title).toBe("Gym options")
    expect(content.excerpt).toBe("Times fit around  and")
    expect(content.mentions).toEqual([
      { targetKey: "document:doc-plan", blockId: "b1" },
      { targetKey: "activity:act-32", blockId: "b1" },
    ])
  })

  it("shortens long excerpts", () => {
    const content = contentOf(doc(title("Long"), p("word ".repeat(80))))
    expect(content.excerpt.length).toBeLessThanOrEqual(160)
    expect(content.excerpt.endsWith("…")).toBe(true)
  })
})
