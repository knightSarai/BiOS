import { Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { areaDotClassNames, type AreaColor } from "../areas"

type AreaOption = {
  id: string
  name: string
  key: string
  color: AreaColor
}

type AreaMenuProps = {
  areas: AreaOption[]
  value: string
  heading: string
  trigger: React.ReactElement
  onChange: (areaId: string) => void
}

function AreaMenu({ areas, value, heading, trigger, onChange }: AreaMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{heading}</DropdownMenuLabel>
          {areas.map((option) => (
            <DropdownMenuItem
              key={option.id}
              className="min-h-8 max-md:min-h-11"
              onClick={() => {
                if (option.id !== value) onChange(option.id)
              }}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  areaDotClassNames[option.color]
                )}
              />
              <span className="flex-1">{option.name}</span>
              <span className="text-xs text-muted-foreground">
                {option.key}
              </span>
              {option.id === value ? (
                <Check className="text-accent-text" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { AreaMenu }
export type { AreaOption }
