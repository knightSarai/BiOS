import { Popover } from "@base-ui/react/popover"
import { useAtomValue } from "jotai"
import type { EditorView } from "prosemirror-view"
import { cn } from "@/lib/utils"
import {
  applySlashItem,
  closeSlashMenu,
  readUi,
  setSlashIndex,
  slashItems,
} from "../editor-ui"
import { blockIcons } from "./block-icons"
import type { EditorAtoms } from "./editor-atoms"
import { shortcutKeys } from "./shortcut-keys"

const caretAnchor = (view: EditorView, pos: number) => ({
  getBoundingClientRect: () => {
    const coords = view.coordsAtPos(pos)
    return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top)
  },
})

type SlashMenuProps = {
  atoms: EditorAtoms
  menuId: string
}

function SlashMenu({ atoms, menuId }: SlashMenuProps) {
  const snapshot = useAtomValue(atoms.snapshot)
  const slash = snapshot ? readUi(snapshot.state).slash : null
  if (!snapshot || !slash) return null

  const { view } = snapshot
  const items = slashItems(slash)

  return (
    <Popover.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) closeSlashMenu(view)
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={caretAnchor(view, slash.from)}
          side="bottom"
          align="start"
          sideOffset={6}
          className="isolate z-50"
        >
          <Popover.Popup
            initialFocus={false}
            finalFocus={false}
            className="max-h-[min(22rem,var(--available-height))] w-64 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
          >
            {items.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                No matching blocks
              </p>
            ) : (
              <div id={menuId} role="listbox" aria-label="Insert block">
                {items.map((item, index) => {
                  const Icon = blockIcons[item.kind]
                  const active = index === slash.index
                  return (
                    <div
                      key={item.kind}
                      id={`${menuId}-${item.kind}`}
                      role="option"
                      aria-selected={active}
                      ref={
                        active
                          ? (element) =>
                              element?.scrollIntoView({ block: "nearest" })
                          : undefined
                      }
                      className={cn(
                        "flex min-h-8 cursor-default items-center gap-2 rounded-md px-2 text-xs select-none max-md:min-h-11",
                        active && "bg-accent text-accent-foreground"
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => {
                        if (!active) setSlashIndex(view, index)
                      }}
                      onClick={() =>
                        applySlashItem(item.kind)(view.state, view.dispatch)
                      }
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1">{item.label}</span>
                      <span className="text-[0.625rem] tracking-widest text-muted-foreground max-md:hidden">
                        {shortcutKeys(item.keys).join(" ")}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export { SlashMenu }
