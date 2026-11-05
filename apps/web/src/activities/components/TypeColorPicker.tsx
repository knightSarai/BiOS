import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { TYPE_COLORS, type TypeColor } from "../activity-types"
import { areaColorNames, areaDotClassNames } from "../areas"

function TypeColorPicker({
  value,
  onChange,
}: {
  value: TypeColor
  onChange: (color: TypeColor) => void
}) {
  return (
    <ToggleGroup
      aria-label="Colour"
      spacing={4}
      value={[value]}
      onValueChange={([next]) => {
        const picked = TYPE_COLORS.find((color) => color === next)
        if (picked) onChange(picked)
      }}
    >
      {TYPE_COLORS.map((color) => (
        <ToggleGroupItem
          key={color}
          value={color}
          aria-label={areaColorNames[color]}
          className="size-8 rounded-full p-0 data-pressed:ring-2 data-pressed:ring-ring max-md:size-11"
        >
          <span
            className={cn("size-4 rounded-full", areaDotClassNames[color])}
          />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export { TypeColorPicker }
