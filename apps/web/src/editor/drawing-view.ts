import { drawingBounds, renderShapes } from "@knight-os/drawing"
import type { Primitive, Shape } from "@knight-os/drawing"
import type { Node } from "prosemirror-model"
import type { NodeView } from "prosemirror-view"
import { webPalette } from "@/drawing/web-palette"

type DrawingPreviews = {
  read: (drawingId: string) => Shape[]
  observe: (drawingId: string, onChange: () => void) => () => void
  open: (drawingId: string) => void
}

const SVG_NS = "http://www.w3.org/2000/svg"
const PREVIEW_PADDING = 24

const primitiveElement = (primitive: Primitive): SVGElement => {
  if (primitive.type === "path") {
    const path = document.createElementNS(SVG_NS, "path")
    path.setAttribute("d", primitive.d)
    path.style.fill = primitive.fill ?? "none"
    path.style.stroke = primitive.stroke ?? "none"
    path.style.strokeWidth = String(primitive.strokeWidth)
    path.style.strokeLinecap = "round"
    path.style.strokeLinejoin = "round"
    if (primitive.dash) path.style.strokeDasharray = primitive.dash
    return path
  }
  const text = document.createElementNS(SVG_NS, "text")
  text.setAttribute("x", String(primitive.x))
  text.setAttribute("y", String(primitive.y))
  text.setAttribute("text-anchor", primitive.anchor)
  text.setAttribute("dominant-baseline", "central")
  text.style.fill = primitive.color
  text.style.fontSize = `${primitive.size}px`
  text.style.fontWeight = String(primitive.weight)
  primitive.lines.forEach((line, index) => {
    const span = document.createElementNS(SVG_NS, "tspan")
    span.setAttribute("x", String(primitive.x))
    span.setAttribute("dy", index === 0 ? "0" : String(primitive.lineHeight))
    span.textContent = line
    text.append(span)
  })
  return text
}

class DrawingView implements NodeView {
  dom: HTMLDivElement
  private svg: SVGSVGElement
  private empty: HTMLDivElement
  private unsubscribe: () => void

  constructor(
    private node: Node,
    private readonly previews: DrawingPreviews
  ) {
    this.dom = document.createElement("div")
    this.dom.contentEditable = "false"
    this.dom.setAttribute("role", "button")
    this.dom.className =
      "group/drawing relative my-2 cursor-pointer overflow-hidden rounded-md border border-border bg-background transition-colors hover:border-muted-foreground/40"

    this.svg = document.createElementNS(SVG_NS, "svg")
    this.svg.setAttribute("class", "block max-h-[28rem] w-full")
    this.svg.setAttribute("aria-hidden", "true")

    this.empty = document.createElement("div")
    this.empty.className =
      "flex flex-col items-center justify-center gap-1 py-10 text-xs text-muted-foreground"
    const emptyTitle = document.createElement("span")
    emptyTitle.className = "font-medium text-foreground"
    emptyTitle.textContent = "Empty drawing"
    const emptyHint = document.createElement("span")
    emptyHint.textContent = "Click to draw"
    this.empty.append(emptyTitle, emptyHint)

    const edit = document.createElement("span")
    edit.className =
      "absolute top-2 right-2 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium opacity-0 transition-opacity group-hover/drawing:opacity-100 max-md:opacity-100"
    edit.textContent = "Edit"

    this.dom.append(this.svg, this.empty, edit)
    this.dom.addEventListener("click", () => {
      const drawingId = this.drawingId
      if (drawingId) this.previews.open(drawingId)
    })
    this.unsubscribe = this.subscribe()
    this.render()
  }

  private subscribe() {
    const drawingId = this.drawingId
    return drawingId
      ? this.previews.observe(drawingId, () => this.render())
      : () => {}
  }

  private get drawingId() {
    return this.node.attrs.drawingId as string | null
  }

  private render() {
    const drawingId = this.drawingId
    const shapes = drawingId ? this.previews.read(drawingId) : []
    const bounds = drawingBounds(shapes)
    this.dom.dataset.blockId = (this.node.attrs.id as string | null) ?? ""
    this.dom.setAttribute(
      "aria-label",
      bounds
        ? "Drawing. Press Enter or click to edit"
        : "Empty drawing. Press Enter or click to draw"
    )
    this.svg.classList.toggle("hidden", !bounds)
    this.empty.classList.toggle("hidden", Boolean(bounds))
    if (!bounds) {
      this.svg.replaceChildren()
      return
    }
    this.svg.setAttribute(
      "viewBox",
      [
        bounds.x - PREVIEW_PADDING,
        bounds.y - PREVIEW_PADDING,
        bounds.w + PREVIEW_PADDING * 2,
        bounds.h + PREVIEW_PADDING * 2,
      ].join(" ")
    )
    this.svg.replaceChildren(
      ...renderShapes(shapes, webPalette).map(primitiveElement)
    )
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false
    const drawingChanged = node.attrs.drawingId !== this.node.attrs.drawingId
    const changed = drawingChanged || node.attrs.id !== this.node.attrs.id
    this.node = node
    if (drawingChanged) {
      this.unsubscribe()
      this.unsubscribe = this.subscribe()
    }
    if (changed) this.render()
    return true
  }

  stopEvent(event: Event) {
    return event.type === "mousedown" || event.type === "click"
  }

  ignoreMutation() {
    return true
  }

  destroy() {
    this.unsubscribe()
  }
}

export { DrawingView }
export type { DrawingPreviews }
