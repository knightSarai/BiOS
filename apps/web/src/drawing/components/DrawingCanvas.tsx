import { useSyncExternalStore } from "react"
import { useAtomValue } from "jotai"
import {
  TEXT_SIZES,
  applyToShapes,
  arrowSegment,
  boxAt,
  boxesById,
  isBox,
  renderShapes,
} from "@knight-os/drawing"
import type { Camera, Primitive, Shape } from "@knight-os/drawing"
import { dragChanges } from "../drag"
import type { DrawingEditor } from "../drawing-editor"
import { colorVar, webPalette } from "../web-palette"

const GRID_PX = 24
const HANDLE_PX = 8
const LABEL_SIZE = 14
const ARROW_LABEL_SIZE = 12

const withoutText = (shape: Shape): Shape =>
  shape.kind === "text"
    ? { ...shape, text: "" }
    : shape.kind === "pen"
      ? shape
      : { ...shape, label: "" }

const textOf = (shape: Shape) =>
  shape.kind === "text" ? shape.text : shape.kind === "pen" ? "" : shape.label

function InlineTextEditor({
  editor,
  shape,
  shapes,
  camera,
}: {
  editor: DrawingEditor
  shape: Shape
  shapes: readonly Shape[]
  camera: Camera
}) {
  const { zoom } = camera
  const screen = (x: number, y: number) => ({
    left: x * zoom + camera.x,
    top: y * zoom + camera.y,
  })
  const isText = shape.kind === "text"
  const placement = isBox(shape)
    ? {
        ...screen(shape.x, shape.y),
        width: shape.w * zoom,
        height: shape.h * zoom,
      }
    : shape.kind === "arrow"
      ? (() => {
          const s = arrowSegment(shape, boxesById(shapes))
          return screen((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2)
        })()
      : screen(
          shape.kind === "text" ? shape.x : 0,
          shape.kind === "text" ? shape.y : 0
        )
  const fontSize =
    (shape.kind === "text"
      ? TEXT_SIZES[shape.size]
      : shape.kind === "arrow"
        ? ARROW_LABEL_SIZE
        : LABEL_SIZE) * zoom
  const finishOnEnter = !isText

  return (
    <div
      className={
        isBox(shape)
          ? "absolute flex items-center justify-center px-2"
          : shape.kind === "arrow"
            ? "absolute -translate-x-1/2 -translate-y-1/2"
            : "absolute"
      }
      style={placement}
    >
      <textarea
        autoFocus
        aria-label={isText ? "Text" : "Label"}
        value={textOf(shape)}
        rows={1}
        onChange={(event) => editor.setLabel(shape.id, event.target.value)}
        onFocus={(event) => {
          const end = event.currentTarget.value.length
          event.currentTarget.setSelectionRange(end, end)
        }}
        onBlur={() => {
          // Switching to another window blurs too; keep editing then.
          if (document.hasFocus()) editor.stopEditing()
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation()
          const done =
            event.key === "Escape" ||
            (event.key === "Enter" &&
              (event.metaKey ||
                event.ctrlKey ||
                (finishOnEnter && !event.shiftKey)))
          if (done) {
            event.preventDefault()
            editor.stopEditing({ refocus: true })
          }
        }}
        className={`field-sizing-content max-w-full min-w-4 resize-none overflow-hidden bg-transparent leading-[1.3] outline-none ${
          isText ? "text-left" : "text-center font-medium"
        } ${shape.kind === "arrow" ? "rounded-sm bg-background px-1.5 text-muted-foreground" : ""}`}
        style={{
          fontSize,
          color: isText ? colorVar(shape.stroke) : undefined,
        }}
      />
    </div>
  )
}

function PrimitiveShape({ primitive }: { primitive: Primitive }) {
  if (primitive.type === "path") {
    return (
      <path
        d={primitive.d}
        style={{
          fill: primitive.fill ?? "none",
          stroke: primitive.stroke ?? "none",
          strokeWidth: primitive.strokeWidth,
          strokeDasharray: primitive.dash ?? undefined,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      />
    )
  }
  return (
    <text
      x={primitive.x}
      y={primitive.y}
      textAnchor={primitive.anchor}
      dominantBaseline="central"
      style={{
        fill: primitive.color,
        fontSize: primitive.size,
        fontWeight: primitive.weight,
      }}
    >
      {primitive.lines.map((line, index) => (
        <tspan
          // Lines have no identity beyond their position in the label.
          // eslint-disable-next-line @eslint-react/no-array-index-key
          key={index}
          x={primitive.x}
          dy={index === 0 ? 0 : primitive.lineHeight}
        >
          {line}
        </tspan>
      ))}
    </text>
  )
}

function DrawingCanvas({ editor }: { editor: DrawingEditor }) {
  const {
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
  } = editor
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const drag = useAtomValue(atoms.drag)
  const camera = useAtomValue(atoms.camera)
  const tool = useAtomValue(atoms.tool)
  const selection = useAtomValue(atoms.selection)
  const editing = useAtomValue(atoms.editing)

  const committed = editing?.draft
    ? [...snapshot.shapes, editing.draft]
    : snapshot.shapes
  const displayed = applyToShapes(committed, dragChanges(drag, committed))
  const editingShape = editing
    ? displayed.find((shape) => shape.id === editing.id)
    : undefined
  const primitives = renderShapes(
    editingShape
      ? displayed.map((shape) =>
          shape.id === editingShape.id ? withoutText(shape) : shape
        )
      : displayed,
    webPalette
  )
  const selected = selectionBounds(displayed, selection)
  const zoom = camera?.zoom ?? 1
  const handle = HANDLE_PX / zoom
  const arrowTarget =
    drag?.mode === "arrow"
      ? boxAt(snapshot.shapes, drag.current, drag.fromId)
      : null
  const marquee =
    drag?.mode === "marquee"
      ? {
          x: Math.min(drag.start.x, drag.current.x),
          y: Math.min(drag.start.y, drag.current.y),
          w: Math.abs(drag.current.x - drag.start.x),
          h: Math.abs(drag.current.y - drag.start.y),
        }
      : null
  const cursor =
    drag?.mode === "pan" || drag?.mode === "pinch"
      ? "cursor-grabbing"
      : tool === "select"
        ? "cursor-default"
        : tool === "text"
          ? "cursor-text"
          : "cursor-crosshair"

  return (
    <div
      ref={attach}
      tabIndex={0}
      role="application"
      aria-label="Drawing canvas. V select, R rectangle, O ellipse, D diamond, A arrow, T text, P pen. Delete removes the selection, Enter edits its label."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      className={`absolute inset-0 touch-none bg-background bg-[radial-gradient(var(--border)_1px,transparent_1px)] outline-none select-none ${cursor}`}
      style={{
        backgroundSize: `${GRID_PX * zoom}px ${GRID_PX * zoom}px`,
        backgroundPosition: camera ? `${camera.x}px ${camera.y}px` : undefined,
      }}
    >
      <svg className="absolute inset-0 size-full" aria-hidden="true">
        {camera ? (
          <g
            transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}
          >
            {primitives.map((primitive) => (
              <PrimitiveShape key={primitive.key} primitive={primitive} />
            ))}
            {arrowTarget ? (
              <rect
                x={arrowTarget.x - 4}
                y={arrowTarget.y - 4}
                width={arrowTarget.w + 8}
                height={arrowTarget.h + 8}
                rx={6}
                vectorEffect="non-scaling-stroke"
                className="fill-ring/10 stroke-ring"
                strokeWidth={1.5}
              />
            ) : null}
            {selected.map(({ id, box, corners }) => (
              <g key={id}>
                <rect
                  x={box.x - 4}
                  y={box.y - 4}
                  width={box.w + 8}
                  height={box.h + 8}
                  rx={3}
                  vectorEffect="non-scaling-stroke"
                  className="fill-none stroke-ring"
                  strokeWidth={1.5}
                />
                {selected.length === 1
                  ? corners.map(([corner, point]) => (
                      <rect
                        key={corner}
                        x={point.x - handle / 2}
                        y={point.y - handle / 2}
                        width={handle}
                        height={handle}
                        rx={1.5 / zoom}
                        vectorEffect="non-scaling-stroke"
                        className="fill-background stroke-ring"
                        strokeWidth={1.5}
                      />
                    ))
                  : null}
              </g>
            ))}
            {marquee ? (
              <rect
                x={marquee.x}
                y={marquee.y}
                width={marquee.w}
                height={marquee.h}
                vectorEffect="non-scaling-stroke"
                className="fill-ring/10 stroke-ring"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ) : null}
          </g>
        ) : null}
      </svg>
      {editingShape && camera ? (
        <InlineTextEditor
          key={editingShape.id}
          editor={editor}
          shape={editingShape}
          shapes={displayed}
          camera={camera}
        />
      ) : null}
    </div>
  )
}

export { DrawingCanvas }
