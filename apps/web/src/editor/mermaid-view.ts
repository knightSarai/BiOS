import type { Node } from "prosemirror-model"
import { Plugin, PluginKey, TextSelection } from "prosemirror-state"
import {
  Decoration,
  DecorationSet,
  type EditorView,
  type NodeView,
  type ViewMutationRecord,
} from "prosemirror-view"
import type * as Y from "yjs"
import {
  isPreviewCurrent,
  savePreview,
  type DiagramPreview,
  type DiagramPreviews,
  type RenderedPreview,
} from "./diagram-previews"
import { readUi } from "./editor-ui"
import { renderMermaid } from "./mermaid-render"
import { sanitizeSvg } from "./svg-safety"
import { nodes } from "./schema"

const RENDER_DELAY_MS = 300
const IDLE_TIMEOUT_MS = 1000

type GetPos = () => number | undefined

type EditingSpec = { mermaidEditing?: boolean }

const isEditing = (decorations: readonly Decoration[]) =>
  decorations.some(
    (decoration) => (decoration.spec as EditingSpec).mermaidEditing === true
  )

const whenIdle = (task: () => void) => {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS })
    return () => cancelIdleCallback(handle)
  }
  const handle = setTimeout(task, 0)
  return () => clearTimeout(handle)
}

const svgHost = (className: string) => {
  const host = document.createElement("div")
  host.className = className
  return { host, root: host.attachShadow({ mode: "open" }) }
}

class MermaidView implements NodeView {
  dom: HTMLDivElement
  contentDOM: HTMLElement
  private preview: HTMLDivElement
  private light: ShadowRoot
  private dark: ShadowRoot
  private error: HTMLParagraphElement
  private shown: RenderedPreview | null = null
  private pending: RenderedPreview | null = null
  private editing: boolean
  private renderTimer: ReturnType<typeof setTimeout> | undefined
  private cancelHiddenTheme = () => {}
  private destroyed = false

  constructor(
    private node: Node,
    private readonly view: EditorView,
    private readonly getPos: GetPos,
    private readonly previews: DiagramPreviews,
    decorations: readonly Decoration[]
  ) {
    this.editing = isEditing(decorations)
    this.dom = document.createElement("div")
    this.dom.className =
      "group/mermaid my-2 overflow-hidden rounded-md border border-border"

    const source = document.createElement("pre")
    source.dir = "ltr"
    source.spellcheck = false
    source.className =
      "hidden overflow-x-auto bg-muted px-4 py-3 font-mono text-[13px] leading-5 group-data-editing/mermaid:block group-data-empty/mermaid:block"
    this.contentDOM = document.createElement("code")
    source.append(this.contentDOM)

    const light = svgHost(
      "w-full text-center leading-none group-data-stale/mermaid:opacity-40 dark:hidden"
    )
    const dark = svgHost(
      "hidden w-full text-center leading-none group-data-stale/mermaid:opacity-40 dark:block"
    )
    this.light = light.root
    this.dark = dark.root

    this.preview = document.createElement("div")
    this.preview.contentEditable = "false"
    this.preview.title = "Edit diagram"
    this.preview.className =
      "relative flex min-h-16 cursor-pointer items-center justify-center overflow-x-auto px-4 py-3 group-data-empty/mermaid:hidden"
    const staleLabel = document.createElement("span")
    staleLabel.textContent = "Last valid version"
    staleLabel.className =
      "absolute top-2 left-2 hidden rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground group-data-stale/mermaid:block"
    this.preview.append(light.host, dark.host, staleLabel)
    this.preview.addEventListener("mousedown", (event) => {
      event.preventDefault()
      this.editSource()
    })

    this.error = document.createElement("p")
    this.error.contentEditable = "false"
    this.error.className =
      "hidden border-t border-border px-4 py-2 font-mono text-xs whitespace-pre-wrap text-error-text group-data-error/mermaid:block group-data-empty/mermaid:hidden"

    this.dom.append(source, this.preview, this.error)
    this.previews.observe(this.onPreviewsChange)
    this.sync()
  }

  private get blockId() {
    return this.node.attrs.id as string | null
  }

  private get source() {
    return this.node.textContent
  }

  private onPreviewsChange = (event: Y.YMapEvent<DiagramPreview>) => {
    const id = this.blockId
    if (id && event.keysChanged.has(id)) this.sync()
  }

  private cached() {
    const id = this.blockId
    return id ? this.previews.get(id) : undefined
  }

  private sync() {
    const empty = this.node.content.size === 0
    this.dom.dataset.blockId = this.blockId ?? ""
    this.dom.toggleAttribute("data-empty", empty)
    if (empty) this.contentDOM.dataset.placeholder = "flowchart LR"
    else delete this.contentDOM.dataset.placeholder

    const cached = this.cached()
    const cachedCurrent = isPreviewCurrent(cached, this.source)
    if (cached && (cachedCurrent || !this.pending)) this.show(cached)

    clearTimeout(this.renderTimer)
    if (empty || cachedCurrent || this.pending?.source === this.source) {
      this.setError(null)
      return
    }
    this.renderTimer = setTimeout(() => void this.render(), RENDER_DELAY_MS)
  }

  // Sanitizing is most of the cost of opening a document with diagrams, so the
  // theme that isn't on screen waits until the browser is idle.
  private show(preview: RenderedPreview) {
    if (this.shown === preview) return
    this.shown = preview
    this.markStale()
    this.cancelHiddenTheme()
    const dark =
      this.dom.ownerDocument.documentElement.classList.contains("dark")
    const [visible, hidden] = dark
      ? [
          { root: this.dark, svg: preview.dark },
          { root: this.light, svg: preview.light },
        ]
      : [
          { root: this.light, svg: preview.light },
          { root: this.dark, svg: preview.dark },
        ]
    visible.root.replaceChildren(sanitizeSvg(visible.svg))
    this.cancelHiddenTheme = whenIdle(() =>
      hidden.root.replaceChildren(sanitizeSvg(hidden.svg))
    )
  }

  private setError(message: string | null) {
    this.dom.toggleAttribute("data-error", message !== null)
    this.error.textContent = message ?? ""
    this.markStale()
  }

  // The drawing on screen no longer matches a source that doesn't parse.
  private markStale() {
    this.dom.toggleAttribute(
      "data-stale",
      this.dom.hasAttribute("data-error") && this.shown !== null
    )
  }

  private async render() {
    const source = this.source
    const blockId = this.blockId
    const result = await renderMermaid(blockId ?? "new", source)
    if (this.destroyed || this.source !== source || this.blockId !== blockId) {
      return
    }
    if (!result.ok) {
      this.setError(result.error)
      return
    }
    this.setError(null)
    this.pending = { source, light: result.light, dark: result.dark }
    this.show(this.pending)
    if (!this.editing) this.savePending()
  }

  // Saving only when editing ends keeps every typing pause from writing two
  // SVGs into the document's history.
  private savePending() {
    const pending = this.pending
    const blockId = this.blockId
    this.pending = null
    if (pending && blockId && pending.source === this.source) {
      savePreview(this.previews, blockId, pending)
    }
  }

  private editSource() {
    const pos = this.getPos()
    if (pos === undefined) return
    const end = pos + this.node.nodeSize - 1
    const { state } = this.view
    this.view.dispatch(
      state.tr.setSelection(TextSelection.create(state.doc, end))
    )
    this.view.focus()
  }

  update(node: Node, decorations: readonly Decoration[]) {
    if (node.type !== this.node.type) return false
    const changed =
      node.textContent !== this.node.textContent ||
      node.attrs.id !== this.node.attrs.id
    const editing = isEditing(decorations)
    const stoppedEditing = this.editing && !editing
    this.node = node
    this.editing = editing
    if (changed) this.sync()
    if (stoppedEditing) this.savePending()
    return true
  }

  stopEvent(event: Event) {
    return (
      event.target instanceof globalThis.Node &&
      this.preview.contains(event.target)
    )
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    return !this.contentDOM.contains(mutation.target)
  }

  destroy() {
    this.destroyed = true
    clearTimeout(this.renderTimer)
    this.cancelHiddenTheme()
    this.savePending()
    this.previews.unobserve(this.onPreviewsChange)
  }
}

const mermaidEditingPlugin = new Plugin({
  key: new PluginKey("mermaidEditing"),
  props: {
    decorations(state) {
      const { $from, $to } = state.selection
      if (!readUi(state).focused || $from.parent.type !== nodes.mermaid) {
        return null
      }
      if (!$from.sameParent($to)) return null
      const spec: EditingSpec = { mermaidEditing: true }
      return DecorationSet.create(state.doc, [
        Decoration.node(
          $from.before(),
          $from.after(),
          { "data-editing": "" },
          spec
        ),
      ])
    },
  },
})

export { MermaidView, mermaidEditingPlugin }
