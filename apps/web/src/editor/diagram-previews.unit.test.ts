import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import {
  diagramPreviewsOf,
  isPreviewCurrent,
  mermaidBlockIds,
  pruneDiagramPreviews,
  savePreview,
} from "./diagram-previews"
import { doc, p } from "./editor-test-utils"
import { schema } from "./schema"

const diagram = (id: string, source: string) =>
  schema.node("mermaid", { id }, [schema.text(source)])

const rendered = (source: string) => ({
  source,
  light: `<svg>${source} light</svg>`,
  dark: `<svg>${source} dark</svg>`,
})

describe("diagram previews", () => {
  it("is current only for the source it was rendered from", () => {
    const previews = diagramPreviewsOf(new Y.Doc())
    savePreview(previews, "a", rendered("graph TD"))
    expect(isPreviewCurrent(previews.get("a"), "graph TD")).toBe(true)
    expect(isPreviewCurrent(previews.get("a"), "graph LR")).toBe(false)
    expect(isPreviewCurrent(previews.get("b"), "graph TD")).toBe(false)
  })

  it("accepts a preview written by a newer app version", () => {
    const previews = diagramPreviewsOf(new Y.Doc())
    previews.set("a", { ...rendered("graph TD"), version: 99 })
    expect(isPreviewCurrent(previews.get("a"), "graph TD")).toBe(true)
  })

  it("skips the write when the same source is already cached", () => {
    const ydoc = new Y.Doc()
    const previews = diagramPreviewsOf(ydoc)
    savePreview(previews, "a", rendered("graph TD"))
    const updates: Uint8Array[] = []
    ydoc.on("update", (update: Uint8Array) => updates.push(update))
    savePreview(previews, "a", rendered("graph TD"))
    expect(updates).toHaveLength(0)
    savePreview(previews, "a", rendered("graph LR"))
    expect(updates).toHaveLength(1)
  })

  it("lists the ids of every diagram in a document", () => {
    const node = doc(diagram("a", "graph TD"), p("text"), diagram("b", "x"))
    expect([...mermaidBlockIds(node)]).toEqual(["a", "b"])
  })

  it("drops previews whose diagram is gone", () => {
    const previews = diagramPreviewsOf(new Y.Doc())
    savePreview(previews, "a", rendered("graph TD"))
    savePreview(previews, "gone", rendered("graph LR"))
    pruneDiagramPreviews(previews, doc(diagram("a", "graph TD")))
    expect([...previews.keys()]).toEqual(["a"])
  })
})
