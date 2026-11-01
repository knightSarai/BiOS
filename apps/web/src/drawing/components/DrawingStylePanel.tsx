import { useSyncExternalStore, type ReactNode } from "react"
import { useAtomValue } from "jotai"
import { DRAWING_COLORS, isBox } from "@knight-os/drawing"
import type {
  DrawingColor,
  Shape,
  StrokeWidth,
  TextSize,
} from "@knight-os/drawing"
import {
  BringToFront,
  Copy,
  SendToBack,
  Trash,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { DrawingEditor } from "../drawing-editor"

const colorNames: Record<DrawingColor, string> = {
  foreground: "Ink",
  muted: "Grey",
  "chart-1": "Lilac",
  "chart-2": "Rose",
  "chart-3": "Blue",
  "chart-4": "Amber",
  "chart-5": "Teal",
}

const strokeClassNames: Record<DrawingColor, string> = {
  foreground: "bg-foreground",
  muted: "bg-muted-foreground",
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
}

const fillClassNames: Record<DrawingColor, string> = {
  foreground: "bg-foreground/25",
  muted: "bg-muted-foreground/25",
  "chart-1": "bg-chart-1/25",
  "chart-2": "bg-chart-2/25",
  "chart-3": "bg-chart-3/25",
  "chart-4": "bg-chart-4/25",
  "chart-5": "bg-chart-5/25",
}

const widths: { value: StrokeWidth; label: string }[] = [
  { value: 1, label: "Thin" },
  { value: 2, label: "Medium" },
  { value: 4, label: "Bold" },
]

const textSizes: { value: TextSize; label: string }[] = [
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
]

const fillColors = DRAWING_COLORS.filter((color) => color !== "foreground")

const swatchClassName =
  "flex size-7 items-center justify-center rounded-md border-2 border-transparent p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-pressed:border-ring max-md:size-9"

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  )
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  destructive = false,
}: {
  label: string
  icon: LucideIcon
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <Button
      variant={destructive ? "destructive" : "ghost"}
      size="icon"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex-1 max-md:h-10"
    >
      <Icon />
    </Button>
  )
}

const labelOf = (shape: Shape) =>
  shape.kind === "text" ? shape.text : shape.kind === "pen" ? null : shape.label

function DrawingStylePanel({ editor }: { editor: DrawingEditor }) {
  const { session, atoms } = editor
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const selection = useAtomValue(atoms.selection)
  const selected = snapshot.shapes.filter((shape) => selection.has(shape.id))
  const first = selected[0]
  if (!first) return null

  const label = selected.length === 1 ? labelOf(first) : null
  const hasLine = selected.some((shape) => shape.kind !== "text")
  const canBeRough = selected.some(
    (shape) => isBox(shape) || shape.kind === "arrow"
  )

  return (
    <aside
      aria-label="Shape style"
      className="absolute z-10 flex flex-col gap-3 overflow-y-auto bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 max-md:inset-x-0 max-md:bottom-[calc(3.25rem+env(safe-area-inset-bottom))] max-md:max-h-[40%] max-md:rounded-t-xl md:top-3 md:left-3 md:max-h-[calc(100%-1.5rem)] md:w-56 md:rounded-lg"
    >
      <Section title={first.kind === "text" ? "Color" : "Stroke"}>
        <div className="flex flex-wrap gap-1">
          {DRAWING_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`${first.kind === "text" ? "Color" : "Stroke"} ${colorNames[color]}`}
              aria-pressed={first.stroke === color}
              title={colorNames[color]}
              className={swatchClassName}
              onClick={() => editor.restyle({ stroke: color })}
            >
              <span
                className={cn("size-full rounded-sm", strokeClassNames[color])}
              />
            </button>
          ))}
        </div>
      </Section>
      {isBox(first) ? (
        <Section title="Fill">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              aria-label="No fill"
              aria-pressed={first.fill === null}
              title="No fill"
              className={swatchClassName}
              onClick={() => editor.restyle({ fill: null })}
            >
              <span className="size-full rounded-sm border border-border bg-[linear-gradient(135deg,transparent_45%,var(--destructive)_45%,var(--destructive)_55%,transparent_55%)]" />
            </button>
            {fillColors.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Fill ${colorNames[color]}`}
                aria-pressed={first.fill === color}
                title={colorNames[color]}
                className={swatchClassName}
                onClick={() => editor.restyle({ fill: color })}
              >
                <span
                  className={cn(
                    "size-full rounded-sm border border-border",
                    fillClassNames[color]
                  )}
                />
              </button>
            ))}
          </div>
        </Section>
      ) : null}
      {hasLine ? (
        <>
          <Section title="Width">
            <ToggleGroup
              aria-label="Stroke width"
              variant="outline"
              size="sm"
              spacing={0}
              value={[String(first.width)]}
              onValueChange={(value) => {
                const width = widths.find((w) => String(w.value) === value[0])
                if (width) editor.restyle({ width: width.value })
              }}
              className="w-full"
            >
              {widths.map((width) => (
                <ToggleGroupItem
                  key={width.value}
                  value={String(width.value)}
                  className="flex-1 max-md:h-9"
                >
                  {width.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Section>
          <Section title="Line">
            <ToggleGroup
              aria-label="Line style"
              variant="outline"
              size="sm"
              spacing={0}
              value={[first.dashed ? "dashed" : "solid"]}
              onValueChange={(value) => {
                if (value[0]) editor.restyle({ dashed: value[0] === "dashed" })
              }}
              className="w-full"
            >
              <ToggleGroupItem value="solid" className="flex-1 max-md:h-9">
                Solid
              </ToggleGroupItem>
              <ToggleGroupItem value="dashed" className="flex-1 max-md:h-9">
                Dashed
              </ToggleGroupItem>
            </ToggleGroup>
          </Section>
        </>
      ) : null}
      {canBeRough ? (
        <Section title="Look">
          <ToggleGroup
            aria-label="Look"
            variant="outline"
            size="sm"
            spacing={0}
            value={[first.rough ? "rough" : "clean"]}
            onValueChange={(value) => {
              if (value[0]) editor.restyle({ rough: value[0] === "rough" })
            }}
            className="w-full"
          >
            <ToggleGroupItem value="clean" className="flex-1 max-md:h-9">
              Clean
            </ToggleGroupItem>
            <ToggleGroupItem value="rough" className="flex-1 max-md:h-9">
              Hand-drawn
            </ToggleGroupItem>
          </ToggleGroup>
        </Section>
      ) : null}
      {first.kind === "text" ? (
        <Section title="Size">
          <ToggleGroup
            aria-label="Text size"
            variant="outline"
            size="sm"
            spacing={0}
            value={[first.size]}
            onValueChange={(value) => {
              const size = textSizes.find((s) => s.value === value[0])
              if (size) editor.setTextSize(size.value)
            }}
            className="w-full"
          >
            {textSizes.map((size) => (
              <ToggleGroupItem
                key={size.value}
                value={size.value}
                className="flex-1 max-md:h-9"
              >
                {size.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Section>
      ) : null}
      {label !== null ? (
        <Section title={first.kind === "text" ? "Text" : "Label"}>
          <Textarea
            aria-label={first.kind === "text" ? "Text" : "Label"}
            placeholder={first.kind === "text" ? "Text" : "Add a label"}
            value={label}
            onChange={(event) => editor.setLabel(first.id, event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return
              event.stopPropagation()
              editor.focusCanvas()
            }}
            className="min-h-9"
          />
        </Section>
      ) : null}
      <div className="flex gap-1 border-t border-border pt-2">
        <ActionButton
          label="Duplicate (Ctrl D)"
          icon={Copy}
          onClick={editor.duplicateSelection}
        />
        <ActionButton
          label="Bring to front"
          icon={BringToFront}
          onClick={() => editor.reorder("front")}
        />
        <ActionButton
          label="Send to back"
          icon={SendToBack}
          onClick={() => editor.reorder("back")}
        />
        <ActionButton
          label="Delete (Delete)"
          icon={Trash}
          onClick={editor.removeSelection}
          destructive
        />
      </div>
    </aside>
  )
}

export { DrawingStylePanel }
