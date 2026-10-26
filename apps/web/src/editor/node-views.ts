import type { Node } from "prosemirror-model"
import type { EditorView, NodeView, ViewMutationRecord } from "prosemirror-view"
import { createStatusIconElement } from "@/activities/status-icon-element"
import type { ActivityBridge, ActivityChipSummary } from "./activity-bridge"
import { toggleCollapsibleAt, toggleTaskAt } from "./commands"

const svgNamespace = "http://www.w3.org/2000/svg"

const icon = (path: string, className: string) => {
  const svg = document.createElementNS(svgNamespace, "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "3")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("class", className)
  const shape = document.createElementNS(svgNamespace, "path")
  shape.setAttribute("d", path)
  svg.append(shape)
  return svg
}

type GetPos = () => number | undefined

class TaskItemView implements NodeView {
  dom: HTMLLIElement
  contentDOM: HTMLDivElement
  private checkbox: HTMLButtonElement

  constructor(
    private node: Node,
    view: EditorView,
    getPos: GetPos
  ) {
    this.dom = document.createElement("li")
    this.dom.className =
      "group/task flex items-start gap-2 data-checked:[&>div>p]:text-muted-foreground data-checked:[&>div>p]:line-through"

    const gutter = document.createElement("span")
    gutter.contentEditable = "false"
    gutter.className = "flex h-7 shrink-0 items-center max-md:h-8"

    this.checkbox = document.createElement("button")
    this.checkbox.type = "button"
    this.checkbox.setAttribute("role", "checkbox")
    this.checkbox.className =
      "flex size-4 items-center justify-center rounded-[4px] border border-muted-foreground/60 text-primary-foreground transition-colors hover:border-foreground aria-checked:border-primary aria-checked:bg-primary max-md:size-5 [&>svg]:hidden aria-checked:[&>svg]:block"
    this.checkbox.append(icon("M20 6 9 17l-5-5", "size-3"))
    this.checkbox.addEventListener("mousedown", (event) =>
      event.preventDefault()
    )
    this.checkbox.addEventListener("click", () => {
      const pos = getPos()
      if (pos === undefined) return
      toggleTaskAt(pos)(view.state, view.dispatch)
    })
    gutter.append(this.checkbox)

    this.contentDOM = document.createElement("div")
    this.contentDOM.className = "min-w-0 flex-1 [&>p]:my-0.5"
    this.dom.append(gutter, this.contentDOM)
    this.render()
  }

  private render() {
    const checked = Boolean(this.node.attrs.checked)
    this.dom.dataset.blockId = (this.node.attrs.id as string | null) ?? ""
    this.dom.toggleAttribute("data-checked", checked)
    this.checkbox.setAttribute("aria-checked", String(checked))
    this.checkbox.setAttribute(
      "aria-label",
      checked ? "Mark as not done" : "Mark as done"
    )
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  stopEvent(event: Event) {
    return (
      event.target instanceof globalThis.Node &&
      this.checkbox.contains(event.target)
    )
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    return !this.contentDOM.contains(mutation.target)
  }
}

class CollapsibleView implements NodeView {
  dom: HTMLDivElement
  contentDOM: HTMLDivElement
  private toggle: HTMLButtonElement

  constructor(
    private node: Node,
    view: EditorView,
    getPos: GetPos
  ) {
    this.dom = document.createElement("div")
    this.dom.className = "group/collapsible my-1 flex items-start gap-1"

    const gutter = document.createElement("span")
    gutter.contentEditable = "false"
    gutter.className = "flex h-7 shrink-0 items-center max-md:h-8"

    this.toggle = document.createElement("button")
    this.toggle.type = "button"
    this.toggle.className =
      "flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-transform hover:bg-muted hover:text-foreground aria-expanded:rotate-90 max-md:size-7"
    this.toggle.append(icon("m9 18 6-6-6-6", "size-3.5"))
    this.toggle.addEventListener("mousedown", (event) => event.preventDefault())
    this.toggle.addEventListener("click", () => {
      const pos = getPos()
      if (pos === undefined) return
      toggleCollapsibleAt(pos)(view.state, view.dispatch)
    })
    gutter.append(this.toggle)

    this.contentDOM = document.createElement("div")
    this.contentDOM.className = "min-w-0 flex-1 [&>p:first-child]:font-medium"
    this.dom.append(gutter, this.contentDOM)
    this.render()
  }

  private render() {
    const open = Boolean(this.node.attrs.open)
    this.dom.dataset.blockId = (this.node.attrs.id as string | null) ?? ""
    this.toggle.setAttribute("aria-expanded", String(open))
    this.toggle.setAttribute(
      "aria-label",
      open ? "Collapse section" : "Expand section"
    )
    this.contentDOM.classList.toggle("[&>*:not(:first-child)]:hidden", !open)
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  stopEvent(event: Event) {
    return (
      event.target instanceof globalThis.Node &&
      this.toggle.contains(event.target)
    )
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    return !this.contentDOM.contains(mutation.target)
  }
}

class ActivityChipView implements NodeView {
  dom: HTMLSpanElement
  private status: HTMLButtonElement
  private key: HTMLSpanElement
  private title: HTMLSpanElement
  private unsubscribe: () => void

  constructor(
    private node: Node,
    private readonly bridge: ActivityBridge
  ) {
    this.dom = document.createElement("span")
    this.dom.contentEditable = "false"
    this.dom.dataset.activityId = this.activityId
    this.dom.className =
      "mx-px inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-border bg-muted/40 px-1.5 align-bottom leading-6 transition-colors hover:bg-muted max-md:leading-7"

    this.status = document.createElement("button")
    this.status.type = "button"
    this.status.className =
      "-ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-background/60 max-md:size-7"
    this.status.addEventListener("mousedown", (event) => event.preventDefault())
    this.status.addEventListener("click", (event) => {
      event.stopPropagation()
      this.bridge.toggleDone(this.activityId)
    })

    this.key = document.createElement("span")
    this.key.className = "shrink-0 text-xs text-muted-foreground tabular-nums"

    this.title = document.createElement("span")
    this.title.className = "min-w-0 truncate"

    this.dom.append(this.status, this.key, this.title)
    this.dom.addEventListener("click", () => this.bridge.open(this.activityId))
    this.unsubscribe = this.subscribe()
  }

  private get activityId() {
    return this.node.attrs.activityId as string
  }

  private subscribe() {
    return this.bridge.observe(this.activityId, (summary) =>
      this.render(summary)
    )
  }

  private render(summary: ActivityChipSummary | null | undefined) {
    if (!summary) {
      this.status.replaceChildren()
      this.status.disabled = true
      this.key.textContent = ""
      this.title.textContent =
        summary === null ? "Deleted activity" : "Loading activity…"
      this.title.classList.add("text-muted-foreground")
      this.dom.removeAttribute("title")
      return
    }
    const closed = summary.status === "done" || summary.status === "canceled"
    this.status.disabled = false
    this.status.replaceChildren(createStatusIconElement(summary.status))
    this.status.setAttribute(
      "aria-label",
      summary.status === "done"
        ? `Reopen ${summary.key}`
        : `Mark ${summary.key} as done`
    )
    this.key.textContent = summary.key
    this.title.textContent = summary.title || "Untitled"
    this.title.classList.toggle(
      "text-muted-foreground",
      closed || !summary.title
    )
    this.title.classList.toggle("line-through", summary.status === "canceled")
    this.dom.title = `Open ${summary.key} (Enter when selected)`
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false
    const changed = node.attrs.activityId !== this.node.attrs.activityId
    this.node = node
    if (changed) {
      this.unsubscribe()
      this.dom.dataset.activityId = this.activityId
      this.unsubscribe = this.subscribe()
    }
    return true
  }

  stopEvent(event: Event) {
    return event.type === "click" || event.type === "mousedown"
      ? event.target instanceof globalThis.Node &&
          this.status.contains(event.target)
      : false
  }

  ignoreMutation() {
    return true
  }

  destroy() {
    this.unsubscribe()
  }
}

const createNodeViews = (bridge: ActivityBridge) => ({
  task_item: (node: Node, view: EditorView, getPos: GetPos) =>
    new TaskItemView(node, view, getPos),
  collapsible: (node: Node, view: EditorView, getPos: GetPos) =>
    new CollapsibleView(node, view, getPos),
  activity: (node: Node) => new ActivityChipView(node, bridge),
})

export { createNodeViews }
