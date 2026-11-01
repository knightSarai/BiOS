import {
  DEFAULT_SHAPE_STYLE,
  boundsOf,
  boxesById,
  createBox,
  createText,
  drawingBounds,
  duplicateChanges,
  fitCamera,
  hitTest,
  importExcalidraw,
  isBox,
  labelChange,
  nextZ,
  offsetShapes,
  removeChanges,
  reorderChanges,
  restyleChanges,
  shapesInBox,
  toWorld,
  unionOf,
  zoomAround,
} from "@knight-os/drawing"
import type {
  BoxKind,
  Camera,
  Corner,
  Point,
  Shape,
  ShapeStyle,
  StyleFields,
  TextShape,
  TextSize,
} from "@knight-os/drawing"
import { atom, type PrimitiveAtom, type createStore } from "jotai"
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react"
import type * as Y from "yjs"
import { committedChanges } from "./drag"
import type { Drag } from "./drag"
import { createDrawingSession } from "./drawing-session"

type Store = ReturnType<typeof createStore>

type Tool = "select" | BoxKind | "arrow" | "text" | "pen"

// A new text shape stays a draft until it has text, so an abandoned click
// leaves nothing behind and no undo step.
type Editing = { id: string; draft: TextShape | null }

type KeyInput = Pick<
  ReactKeyboardEvent<HTMLElement>,
  | "key"
  | "ctrlKey"
  | "metaKey"
  | "shiftKey"
  | "preventDefault"
  | "stopPropagation"
>

type ImportSummary = {
  count: number
  skipped: Record<string, number>
  simplified: Record<string, number>
}

const HIT_TOLERANCE_PX = 6
const HANDLE_HIT_PX = 10
const MIN_ZOOM = 0.2
const MAX_ZOOM = 4
const FIT_PADDING_PX = 96
const FIT_PADDING_SHARE = 0.08
const PEN_MIN_STEP_PX = 1.5
const TAP_SLOP_PX = 3
const NARROW_PX = 768
const SHEET_SHARE = 0.4
const PHONE_TOOLBAR_PX = 52
const REVEAL_MARGIN_PX = 16
const IMPORT_GAP = 80

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  r: "rect",
  o: "ellipse",
  d: "diamond",
  a: "arrow",
  t: "text",
  p: "pen",
}

const isBoxTool = (tool: Tool): tool is BoxKind =>
  tool === "rect" || tool === "ellipse" || tool === "diamond"

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

const makeShapeId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12)

const cornersOf = (shape: Shape): [Corner, Point][] =>
  isBox(shape)
    ? [
        ["nw", { x: shape.x, y: shape.y }],
        ["ne", { x: shape.x + shape.w, y: shape.y }],
        ["sw", { x: shape.x, y: shape.y + shape.h }],
        ["se", { x: shape.x + shape.w, y: shape.y + shape.h }],
      ]
    : []

// The style atom comes from the document editor, so the last style picked
// carries over to the next drawing opened in the same document.
const createDrawingEditor = (
  ydoc: Y.Doc,
  drawingId: string,
  store: Store,
  style: PrimitiveAtom<ShapeStyle> = atom(DEFAULT_SHAPE_STYLE)
) => {
  const session = createDrawingSession(ydoc, drawingId)
  const atoms = {
    tool: atom<Tool>("select"),
    selection: atom<ReadonlySet<string>>(new Set<string>()),
    camera: atom<Camera | null>(null),
    drag: atom<Drag | null>(null),
    editing: atom<Editing | null>(null),
    style,
  }
  // Active touches, read only while a gesture runs; nothing renders from it.
  const pointers = new Map<number, Point>()
  let canvas: HTMLElement | null = null

  const shapes = () => session.getSnapshot().shapes
  const camera = () => store.get(atoms.camera) ?? { x: 0, y: 0, zoom: 1 }
  const selection = () => store.get(atoms.selection)
  const select = (ids: Iterable<string>) =>
    store.set(atoms.selection, new Set(ids))

  const screenPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvas?.getBoundingClientRect()
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    }
  }

  const viewport = () => ({
    w: canvas?.clientWidth ?? 1280,
    h: canvas?.clientHeight ?? 720,
  })

  const viewportCenter = () => {
    const size = viewport()
    return toWorld(camera(), { x: size.w / 2, y: size.h / 2 })
  }

  const fit = () => {
    const bounds = drawingBounds(shapes())
    const size = viewport()
    store.set(
      atoms.camera,
      bounds
        ? fitCamera(
            bounds,
            size,
            Math.min(FIT_PADDING_PX, size.w * FIT_PADDING_SHARE),
            1
          )
        : { x: size.w / 2, y: size.h / 2, zoom: 1 }
    )
  }

  // On a phone the style sheet covers the lower part of the canvas, so a
  // selection that lands under it is panned up into view.
  const revealSelection = () => {
    const size = viewport()
    if (size.w >= NARROW_PX) return
    const ids = selection()
    const current = shapes()
    const draft = store.get(atoms.editing)?.draft
    const all = draft ? [...current, draft] : current
    const boxes = boxesById(all)
    const area = unionOf(
      all.filter((s) => ids.has(s.id)).map((s) => boundsOf(s, boxes))
    )
    if (!area) return
    const view = camera()
    const visibleBottom = size.h * (1 - SHEET_SHARE) - PHONE_TOOLBAR_PX
    const left = area.x * view.zoom + view.x
    const right = (area.x + area.w) * view.zoom + view.x
    const top = area.y * view.zoom + view.y
    const bottom = (area.y + area.h) * view.zoom + view.y
    const visible =
      left >= REVEAL_MARGIN_PX &&
      right <= size.w - REVEAL_MARGIN_PX &&
      top >= REVEAL_MARGIN_PX &&
      bottom <= visibleBottom - REVEAL_MARGIN_PX
    if (visible) return
    store.set(atoms.camera, {
      ...view,
      x: size.w / 2 - (area.x + area.w / 2) * view.zoom,
      y: visibleBottom / 2 - (area.y + area.h / 2) * view.zoom,
    })
  }

  const zoomTo = (zoom: number, around?: Point) => {
    const size = viewport()
    store.set(
      atoms.camera,
      zoomAround(
        camera(),
        around ?? { x: size.w / 2, y: size.h / 2 },
        clampZoom(zoom)
      )
    )
  }

  const pinchState = () => {
    const [a, b] = [...pointers.values()]
    if (!a || !b) return null
    return {
      distance: Math.hypot(b.x - a.x, b.y - a.y),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    }
  }

  const cornerAt = (world: Point): [string, Corner] | null => {
    const ids = [...selection()]
    const only =
      ids.length === 1 ? shapes().find((s) => s.id === ids[0]) : undefined
    if (!only) return null
    const reach = HANDLE_HIT_PX / camera().zoom
    const hit = cornersOf(only).find(
      ([, point]) =>
        Math.abs(point.x - world.x) <= reach &&
        Math.abs(point.y - world.y) <= reach
    )
    return hit ? [only.id, hit[0]] : null
  }

  const stopEditing = ({ refocus = false } = {}) => {
    const editing = store.get(atoms.editing)
    if (!editing) return
    store.set(atoms.editing, null)
    session.stopCapturing()
    if (editing.draft) {
      if (editing.draft.text.trim() === "") select([])
      else session.apply([{ type: "add", shape: editing.draft }])
    }
    if (refocus) canvas?.focus()
  }

  const startEditing = (id: string, draft: TextShape | null = null) => {
    const shape = draft ?? shapes().find((s) => s.id === id)
    if (!shape || shape.kind === "pen") return
    stopEditing()
    session.stopCapturing()
    select([id])
    store.set(atoms.editing, { id, draft })
    revealSelection()
  }

  const startText = (at: Point) => {
    const text = createText(
      makeShapeId(),
      nextZ(shapes()),
      at,
      store.get(atoms.style)
    )
    store.set(atoms.tool, "select")
    startEditing(text.id, text)
  }

  const startDrag = (event: ReactPointerEvent<HTMLElement>, screen: Point) => {
    const view = camera()
    const world = toWorld(view, screen)
    const tool = store.get(atoms.tool)
    const style = store.get(atoms.style)
    if (event.button === 1) {
      store.set(atoms.drag, {
        mode: "pan",
        startScreen: screen,
        startCamera: view,
      })
      return
    }
    switch (tool) {
      case "select": {
        const corner = cornerAt(world)
        if (corner) {
          store.set(atoms.drag, {
            mode: "resize",
            id: corner[0],
            corner: corner[1],
            current: world,
          })
          return
        }
        const hit = hitTest(shapes(), world, HIT_TOLERANCE_PX / view.zoom)
        if (hit) {
          const current = selection()
          const next = event.shiftKey
            ? current.has(hit.id)
              ? [...current].filter((id) => id !== hit.id)
              : [...current, hit.id]
            : current.has(hit.id)
              ? [...current]
              : [hit.id]
          select(next)
          store.set(atoms.drag, {
            mode: "move",
            ids: new Set(next),
            start: world,
            current: world,
          })
          return
        }
        if (!event.shiftKey) select([])
        store.set(
          atoms.drag,
          event.pointerType === "touch"
            ? { mode: "pan", startScreen: screen, startCamera: view }
            : { mode: "marquee", start: world, current: world }
        )
        return
      }
      case "rect":
      case "ellipse":
      case "diamond":
        store.set(atoms.drag, {
          mode: "create",
          kind: tool,
          id: makeShapeId(),
          style,
          start: world,
          current: world,
        })
        return
      case "arrow": {
        const from = hitTest(shapes().filter(isBox), world, 0)
        store.set(atoms.drag, {
          mode: "arrow",
          id: makeShapeId(),
          style,
          fromId: from?.id ?? null,
          start: world,
          current: world,
        })
        return
      }
      case "pen":
        store.set(atoms.drag, {
          mode: "pen",
          id: makeShapeId(),
          style,
          points: [[world.x, world.y]],
        })
        return
      case "text":
        startText(world)
        return
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    // Without this the follow-up mousedown moves focus to the canvas and
    // blurs a text field this pointerdown just opened.
    event.preventDefault()
    stopEditing()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus()
    const screen = screenPoint(event)
    pointers.set(event.pointerId, screen)
    const pinch = event.pointerType === "touch" ? pinchState() : null
    if (pinch) {
      store.set(atoms.drag, {
        mode: "pinch",
        startDistance: pinch.distance,
        startCenter: pinch.center,
        startCamera: camera(),
      })
      return
    }
    startDrag(event, screen)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointers.has(event.pointerId)) return
    const screen = screenPoint(event)
    pointers.set(event.pointerId, screen)
    const drag = store.get(atoms.drag)
    if (!drag) return
    if (drag.mode === "pinch") {
      const pinch = pinchState()
      if (!pinch) return
      const zoom = clampZoom(
        drag.startCamera.zoom * (pinch.distance / drag.startDistance)
      )
      const anchored = zoomAround(drag.startCamera, drag.startCenter, zoom)
      store.set(atoms.camera, {
        zoom,
        x: anchored.x + pinch.center.x - drag.startCenter.x,
        y: anchored.y + pinch.center.y - drag.startCenter.y,
      })
      return
    }
    if (drag.mode === "pan") {
      store.set(atoms.camera, {
        ...drag.startCamera,
        x: drag.startCamera.x + screen.x - drag.startScreen.x,
        y: drag.startCamera.y + screen.y - drag.startScreen.y,
      })
      return
    }
    const world = toWorld(camera(), screen)
    if (drag.mode === "pen") {
      const last = drag.points[drag.points.length - 1]
      if (
        last &&
        Math.hypot(world.x - last[0], world.y - last[1]) <
          PEN_MIN_STEP_PX / camera().zoom
      )
        return
      store.set(atoms.drag, {
        ...drag,
        points: [...drag.points, [world.x, world.y]],
      })
      return
    }
    store.set(atoms.drag, { ...drag, current: world })
  }

  const finishDrag = () => {
    const drag = store.get(atoms.drag)
    store.set(atoms.drag, null)
    if (!drag) return
    const current = shapes()
    if (drag.mode === "marquee") {
      const area = {
        x: Math.min(drag.start.x, drag.current.x),
        y: Math.min(drag.start.y, drag.current.y),
        w: Math.abs(drag.current.x - drag.start.x),
        h: Math.abs(drag.current.y - drag.start.y),
      }
      if (area.w > 2 || area.h > 2)
        select(shapesInBox(current, area).map((s) => s.id))
      return
    }
    if (drag.mode === "move") {
      const moved =
        Math.hypot(
          drag.current.x - drag.start.x,
          drag.current.y - drag.start.y
        ) * camera().zoom
      if (moved < TAP_SLOP_PX) {
        revealSelection()
        return
      }
    }
    const changes = committedChanges(drag, current)
    session.apply(changes)
    if (
      changes.length > 0 &&
      (drag.mode === "create" || drag.mode === "arrow")
    ) {
      select([drag.id])
      store.set(atoms.tool, "select")
      revealSelection()
    }
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    pointers.delete(event.pointerId)
    const drag = store.get(atoms.drag)
    if (drag?.mode === "pinch") {
      if (pointers.size === 0) store.set(atoms.drag, null)
      return
    }
    finishDrag()
  }

  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    pointers.delete(event.pointerId)
    store.set(atoms.drag, null)
  }

  const onDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const world = toWorld(camera(), screenPoint(event))
    const hit = hitTest(shapes(), world, HIT_TOLERANCE_PX / camera().zoom)
    if (hit) startEditing(hit.id)
    else startText(world)
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      zoomTo(camera().zoom * Math.exp(-event.deltaY * 0.01), screenPoint(event))
      return
    }
    const view = camera()
    store.set(atoms.camera, {
      ...view,
      x: view.x - event.deltaX,
      y: view.y - event.deltaY,
    })
  }

  // React registers wheel listeners as passive, and zooming has to stop the
  // browser's own page zoom.
  const attach = (element: HTMLElement | null) => {
    canvas = element
    if (!element) return
    if (store.get(atoms.camera) === null) fit()
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => element.removeEventListener("wheel", onWheel)
  }

  const removeSelection = () => {
    const ids = selection()
    if (ids.size === 0) return
    session.apply(removeChanges(shapes(), ids))
    select([])
  }

  const duplicateSelection = () => {
    const { changes, ids } = duplicateChanges(
      shapes(),
      selection(),
      makeShapeId
    )
    session.apply(changes)
    if (ids.length > 0) select(ids)
  }

  const restyle = (style: StyleFields) => {
    store.set(atoms.style, (current) => ({ ...current, ...style }))
    session.apply(restyleChanges(shapes(), selection(), style))
  }

  const setTextSize = (size: TextSize) => {
    session.apply(
      shapes()
        .filter((shape) => selection().has(shape.id) && shape.kind === "text")
        .map((shape) => ({
          type: "update" as const,
          id: shape.id,
          fields: { size },
        }))
    )
  }

  const setLabel = (id: string, value: string) => {
    const editing = store.get(atoms.editing)
    if (editing?.draft?.id === id) {
      store.set(atoms.editing, {
        id,
        draft: { ...editing.draft, text: value },
      })
      return
    }
    const shape = shapes().find((s) => s.id === id)
    const change = shape ? labelChange(shape, value) : null
    if (change) session.apply([change], { typing: true })
  }

  const reorder = (direction: "front" | "back") => {
    session.apply(reorderChanges(shapes(), selection(), direction))
  }

  const createAtCenter = (kind: BoxKind) => {
    const center = viewportCenter()
    const box = createBox(
      kind,
      makeShapeId(),
      nextZ(shapes()),
      center,
      center,
      store.get(atoms.style)
    )
    session.apply([{ type: "add", shape: box }])
    store.set(atoms.tool, "select")
    startEditing(box.id)
  }

  const importFile = async (file: File): Promise<ImportSummary | null> => {
    const result = importExcalidraw(await file.text(), makeShapeId)
    if (!result) return null
    const current = shapes()
    const existing = drawingBounds(current)
    const incoming = drawingBounds(result.shapes)
    const dx = incoming
      ? (existing ? existing.x + existing.w + IMPORT_GAP : 0) - incoming.x
      : 0
    const dy = incoming ? (existing ? existing.y : 0) - incoming.y : 0
    const top = nextZ(current)
    const placed = offsetShapes(result.shapes, dx, dy).map((shape, index) => ({
      ...shape,
      z: top + index,
    }))
    session.apply(placed.map((shape) => ({ type: "add" as const, shape })))
    select(placed.map((shape) => shape.id))
    fit()
    return {
      count: placed.length,
      skipped: result.skipped,
      simplified: result.simplified,
    }
  }

  const onKeyDown = (event: KeyInput) => {
    const key = event.key.toLowerCase()
    const mod = event.ctrlKey || event.metaKey
    const tool = store.get(atoms.tool)
    if (mod && key === "z") {
      event.preventDefault()
      if (event.shiftKey) session.redo()
      else session.undo()
      return
    }
    if (mod && key === "y") {
      event.preventDefault()
      session.redo()
      return
    }
    if (mod && key === "d") {
      event.preventDefault()
      duplicateSelection()
      return
    }
    if (mod && key === "a") {
      event.preventDefault()
      select(shapes().map((s) => s.id))
      return
    }
    if (key === "delete" || key === "backspace") {
      event.preventDefault()
      removeSelection()
      return
    }
    if (key === "escape") {
      if (selection().size > 0 || tool !== "select") {
        event.stopPropagation()
        select([])
        store.set(atoms.tool, "select")
      }
      return
    }
    if (key === "enter") {
      event.preventDefault()
      const [only] = selection()
      if (isBoxTool(tool)) createAtCenter(tool)
      else if (tool === "text") startText(viewportCenter())
      else if (selection().size === 1 && only) startEditing(only)
      return
    }
    const next = TOOL_KEYS[key]
    if (!mod && next) store.set(atoms.tool, next)
  }

  const selectionBounds = (
    displayed: readonly Shape[],
    ids: ReadonlySet<string>
  ) => {
    const boxes = boxesById(displayed)
    return displayed
      .filter((shape) => ids.has(shape.id))
      .map((shape) => ({
        id: shape.id,
        box: boundsOf(shape, boxes),
        corners: cornersOf(shape),
      }))
  }

  return {
    session,
    atoms,
    attach,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onDoubleClick,
    onKeyDown,
    selectionBounds,
    setTool: (tool: Tool) => store.set(atoms.tool, tool),
    undo: session.undo,
    redo: session.redo,
    removeSelection,
    duplicateSelection,
    restyle,
    setTextSize,
    setLabel,
    stopEditing,
    reorder,
    importFile,
    focusCanvas: () => canvas?.focus(),
    zoomIn: () => zoomTo(camera().zoom * 1.25),
    zoomOut: () => zoomTo(camera().zoom / 1.25),
    zoomReset: () => zoomTo(1),
    fit,
    destroy: () => {
      pointers.clear()
      session.destroy()
    },
  }
}

type DrawingEditor = ReturnType<typeof createDrawingEditor>

export { createDrawingEditor }
export type { DrawingEditor, ImportSummary, Tool }
