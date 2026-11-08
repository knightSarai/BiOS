import type { Node } from "prosemirror-model"
import type * as Y from "yjs"
import { nodes } from "./schema"

const DIAGRAM_PREVIEWS = "diagramPreviews"

// Bump when the render setup changes (theme, fonts) so cached previews redraw.
const DIAGRAM_PREVIEW_VERSION = 3

// Rendered once by whoever edits the source, so clients that can't run Mermaid
// (mobile, exports) can still show the diagram.
type DiagramPreview = {
  version: number
  source: string
  light: string
  dark: string
}

type RenderedPreview = Omit<DiagramPreview, "version">

type DiagramPreviews = Y.Map<DiagramPreview>

const diagramPreviewsOf = (ydoc: Y.Doc): DiagramPreviews =>
  ydoc.getMap<DiagramPreview>(DIAGRAM_PREVIEWS)

// A newer client's preview counts as current, so two app versions don't keep
// overwriting each other's render.
const isPreviewCurrent = (
  preview: DiagramPreview | undefined,
  source: string
) =>
  preview !== undefined &&
  preview.version >= DIAGRAM_PREVIEW_VERSION &&
  preview.source === source

const savePreview = (
  previews: DiagramPreviews,
  blockId: string,
  preview: RenderedPreview
) => {
  if (isPreviewCurrent(previews.get(blockId), preview.source)) return
  previews.set(blockId, { ...preview, version: DIAGRAM_PREVIEW_VERSION })
}

const mermaidBlockIds = (doc: Node) => {
  const ids = new Set<string>()
  doc.descendants((node) => {
    if (node.type === nodes.mermaid && typeof node.attrs.id === "string") {
      ids.add(node.attrs.id)
    }
    return !node.isTextblock
  })
  return ids
}

const pruneDiagramPreviews = (previews: DiagramPreviews, doc: Node) => {
  const live = mermaidBlockIds(doc)
  const stale = [...previews.keys()].filter((id) => !live.has(id))
  if (stale.length === 0) return
  const remove = () => {
    for (const id of stale) previews.delete(id)
  }
  if (previews.doc) previews.doc.transact(remove)
  else remove()
}

export {
  diagramPreviewsOf,
  isPreviewCurrent,
  mermaidBlockIds,
  pruneDiagramPreviews,
  savePreview,
}
export type { DiagramPreview, DiagramPreviews, RenderedPreview }
