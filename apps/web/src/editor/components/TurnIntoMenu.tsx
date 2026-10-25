import { Check } from "lucide-react"
import type { Command } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { blockCatalog, type BlockKind } from "../block-catalog"
import { turnInto } from "../commands"
import { blockIcons } from "./block-icons"
import { shortcutKeys } from "./shortcut-keys"

const convertibleBlocks = blockCatalog.filter(
  (item) => item.kind !== "horizontal_rule"
)

type TurnIntoItemsProps = {
  view: EditorView
  active: BlockKind | null
  before?: Command
}

function TurnIntoItems({ view, active, before }: TurnIntoItemsProps) {
  return convertibleBlocks.map((item) => {
    const Icon = blockIcons[item.kind]
    return (
      <DropdownMenuItem
        key={item.kind}
        className="min-h-8 max-md:min-h-11"
        onClick={() => {
          before?.(view.state, view.dispatch)
          turnInto(item.kind)(view.state, view.dispatch)
          view.focus()
        }}
      >
        <Icon className="text-muted-foreground" />
        <span className="flex-1">{item.label}</span>
        {active === item.kind ? <Check className="text-accent-text" /> : null}
        <DropdownMenuShortcut className="max-md:hidden">
          {shortcutKeys(item.keys).join(" ")}
        </DropdownMenuShortcut>
      </DropdownMenuItem>
    )
  })
}

type TurnIntoMenuProps = TurnIntoItemsProps & {
  trigger: React.ReactElement
  side?: "top" | "bottom"
  onOpenChange?: (open: boolean) => void
}

function TurnIntoMenu({
  trigger,
  side = "bottom",
  onOpenChange,
  ...props
}: TurnIntoMenuProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        side={side}
        className="w-60"
        finalFocus={{ current: props.view.dom }}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Turn into</DropdownMenuLabel>
          <TurnIntoItems {...props} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { TurnIntoItems, TurnIntoMenu }
