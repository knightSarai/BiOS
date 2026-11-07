import { useId } from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { Plus } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { markValidity, refreshValidity } from "@/lib/mark-validity"
import {
  AREA_COLORS,
  EXTRA_COLORS,
  colorName,
  colorSchema,
  isHexColor,
  toSixDigitHex,
  type AreaColor,
} from "../areas"
import { ColorDot } from "./ColorDot"

const swatchClassName =
  "size-8 rounded-full p-0 aria-pressed:bg-transparent aria-pressed:ring-2 aria-pressed:ring-ring max-md:size-11"

const HEX_PATTERN = "#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})"

function ColorPicker({
  value,
  onChange,
}: {
  value: AreaColor
  onChange: (color: AreaColor) => void
}) {
  const hexErrorId = useId()
  const custom = isHexColor(value) ? value : null
  const swatches: AreaColor[] = custom
    ? [...AREA_COLORS, custom]
    : [...AREA_COLORS]
  const commitHex = (input: HTMLInputElement) => {
    const parsed = colorSchema.safeParse(toSixDigitHex(input.value))
    if (parsed.success && parsed.data !== value) onChange(parsed.data)
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <ToggleGroup
        aria-label="Colour"
        spacing={1}
        value={[value]}
        onValueChange={([next]) => {
          const picked = swatches.find((color) => color === next)
          if (picked) onChange(picked)
        }}
        className="flex-wrap"
      >
        {AREA_COLORS.map((color) => (
          <ToggleGroupItem
            key={color}
            value={color}
            aria-label={colorName(color)}
            title={colorName(color)}
            className={swatchClassName}
          >
            <ColorDot color={color} className="size-4" />
          </ToggleGroupItem>
        ))}
        {custom ? (
          <ToggleGroupItem
            value={custom}
            aria-label={colorName(custom)}
            title={colorName(custom)}
            className={swatchClassName}
          >
            <ColorDot color={custom} className="size-4" />
          </ToggleGroupItem>
        ) : null}
      </ToggleGroup>
      <Separator orientation="vertical" className="mx-1 h-5 self-center" />
      <Popover>
        <PopoverTrigger
          aria-label="More colours"
          title="More colours"
          className="grid size-8 place-items-center rounded-full border border-dashed text-muted-foreground transition-colors hover:border-solid hover:bg-accent hover:text-foreground data-popup-open:border-solid data-popup-open:bg-accent data-popup-open:text-foreground max-md:size-11"
        >
          <Plus className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 gap-3 p-3">
          <div className="flex flex-col gap-2">
            <p className="font-medium text-muted-foreground">More colours</p>
            <div className="grid grid-cols-6 gap-1">
              {EXTRA_COLORS.map((extra) => (
                <PopoverPrimitive.Close
                  key={extra.value}
                  render={
                    <Toggle
                      aria-label={extra.name}
                      title={extra.name}
                      pressed={value === extra.value}
                      onPressedChange={(pressed) => {
                        if (pressed) onChange(extra.value)
                      }}
                      className={swatchClassName}
                    />
                  }
                >
                  <ColorDot color={extra.value} className="size-4" />
                </PopoverPrimitive.Close>
              ))}
            </div>
          </div>
          <Separator />
          <div className="flex items-start gap-2">
            <label
              title="Pick any colour"
              className="relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-[conic-gradient(#e07a5f,#d9a441,#8fae7c,#6aaed6,#7b7fd1,#b9638a,#e07a5f)] ring-1 ring-foreground/10 focus-within:ring-2 focus-within:ring-ring max-md:size-11"
            >
              <span className="sr-only">Pick any colour</span>
              <input
                key={custom ?? "preset"}
                type="color"
                defaultValue={custom ?? "#8a94a6"}
                // React's onChange fires on every drag tick; the native change event fires once, when the picker closes.
                ref={(input) => {
                  if (!input) return
                  const commit = () => {
                    const parsed = colorSchema.safeParse(input.value)
                    if (parsed.success && parsed.data !== value)
                      onChange(parsed.data)
                  }
                  input.addEventListener("change", commit)
                  return () => input.removeEventListener("change", commit)
                }}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <input
                key={custom ?? "preset"}
                aria-label="Hex colour"
                defaultValue={custom ?? ""}
                placeholder="#4f86b8"
                pattern={HEX_PATTERN}
                spellCheck={false}
                onChange={(event) =>
                  refreshValidity(event.currentTarget, hexErrorId)
                }
                onBlur={(event) => {
                  markValidity(event.currentTarget, hexErrorId)
                  if (event.currentTarget.checkValidity())
                    commitHex(event.currentTarget)
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  event.currentTarget.blur()
                }}
                className="peer h-8 min-w-0 rounded-md border border-input bg-transparent px-2 font-mono text-xs uppercase outline-none placeholder:text-muted-foreground placeholder:normal-case user-invalid:border-destructive focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 max-md:h-11"
              />
              <p
                id={hexErrorId}
                role="alert"
                className="hidden text-destructive peer-user-invalid:block"
              >
                Use a hex code, like #4f86b8 or #fff.
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { ColorPicker }
