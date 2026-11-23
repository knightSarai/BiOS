import { useRef } from "react"
import type { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { useSetAtom } from "jotai"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  IconChooser,
  resetIconChooserAtom,
} from "@/notebook/components/IconPicker"
import type { TypeColor } from "../activity-types"
import { swatchStyle } from "./ColorDot"
import { TypeIcon } from "./TypeIcon"

function TypeIconPicker({
  type,
  onChange,
}: {
  type: { name: string; color: TypeColor; icon: string | null }
  onChange: (icon: string | null) => void
}) {
  const actions = useRef<PopoverPrimitive.Root.Actions>(null)
  const resetChooser = useSetAtom(resetIconChooserAtom)

  return (
    <Popover
      actionsRef={actions}
      onOpenChange={(open) => {
        if (!open) resetChooser()
      }}
    >
      <PopoverTrigger
        aria-label={`Icon for ${type.name}`}
        className="flex size-10 shrink-0 items-center justify-center rounded-md border outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-accent max-md:size-11"
      >
        <TypeIcon
          color={type.color}
          icon={type.icon}
          className="size-5 text-lg"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 gap-0 p-0"
        aria-label="Choose an icon"
      >
        <div style={swatchStyle(type.color)}>
          <IconChooser
            value={type.icon}
            removeTo={null}
            offerDefault={false}
            tintClassName="text-(--swatch)"
            onChoose={(icon) => {
              if (icon !== type.icon) onChange(icon)
              actions.current?.close()
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { TypeIconPicker }
