import { useAtomValue } from "jotai"
import {
  ArrowUpRight,
  Circle,
  Diamond,
  MousePointer2,
  Pencil,
  Square,
  Type,
  type LucideIcon,
} from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { DrawingEditor, Tool } from "../drawing-editor"

const tools: { tool: Tool; label: string; key: string; icon: LucideIcon }[] = [
  { tool: "select", label: "Select", key: "V", icon: MousePointer2 },
  { tool: "rect", label: "Rectangle", key: "R", icon: Square },
  { tool: "ellipse", label: "Ellipse", key: "O", icon: Circle },
  { tool: "diamond", label: "Diamond", key: "D", icon: Diamond },
  { tool: "arrow", label: "Arrow", key: "A", icon: ArrowUpRight },
  { tool: "text", label: "Text", key: "T", icon: Type },
  { tool: "pen", label: "Pen", key: "P", icon: Pencil },
]

const isTool = (value: unknown): value is Tool =>
  tools.some((item) => item.tool === value)

function DrawingToolbar({ editor }: { editor: DrawingEditor }) {
  const tool = useAtomValue(editor.atoms.tool)

  return (
    <ToggleGroup
      aria-label="Tools"
      value={[tool]}
      onValueChange={(value) => {
        const next: unknown = value[0]
        if (isTool(next)) editor.setTool(next)
      }}
      spacing={1}
      className="absolute z-10 justify-center bg-popover shadow-md ring-1 ring-foreground/10 max-md:inset-x-0 max-md:bottom-0 max-md:w-full max-md:rounded-none max-md:p-1 max-md:pb-[max(0.25rem,env(safe-area-inset-bottom))] md:top-3 md:left-1/2 md:-translate-x-1/2 md:rounded-lg md:p-1"
    >
      {tools.map(({ tool: value, label, key, icon: Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={`${label} (${key})`}
          title={`${label} (${key})`}
          className="relative size-9 max-md:size-11"
        >
          <Icon />
          <span className="absolute right-0.5 bottom-0 text-[9px] text-muted-foreground max-md:hidden">
            {key}
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export { DrawingToolbar }
