import { ArrowDown, ArrowUp, Copy, Link, Trash } from "lucide-react"
import type { EditorView } from "prosemirror-view"
import { toast } from "sonner"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"
import { deleteBlockAt, duplicateBlockAt, moveBlockAt } from "../commands"
import { shortcutKeys } from "./shortcut-keys"

type BlockActionItemsProps = {
  view: EditorView
  pos: number
  blockLink: (blockId: string) => string
}

const itemClassName = "min-h-8 max-md:min-h-11"

function BlockActionItems({ view, pos, blockLink }: BlockActionItemsProps) {
  const run = (command: ReturnType<typeof moveBlockAt>) => {
    command(view.state, view.dispatch)
    view.focus()
  }
  const blockId = view.state.doc.nodeAt(pos)?.attrs.id as
    string | null | undefined

  return (
    <>
      <DropdownMenuItem
        className={itemClassName}
        disabled={!moveBlockAt(pos, -1)(view.state)}
        onClick={() => run(moveBlockAt(pos, -1))}
      >
        <ArrowUp className="text-muted-foreground" />
        <span className="flex-1">Move up</span>
        <DropdownMenuShortcut className="max-md:hidden">
          {shortcutKeys("Alt-↑").join(" ")}
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        className={itemClassName}
        disabled={!moveBlockAt(pos, 1)(view.state)}
        onClick={() => run(moveBlockAt(pos, 1))}
      >
        <ArrowDown className="text-muted-foreground" />
        <span className="flex-1">Move down</span>
        <DropdownMenuShortcut className="max-md:hidden">
          {shortcutKeys("Alt-↓").join(" ")}
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        className={itemClassName}
        onClick={() => run(duplicateBlockAt(pos))}
      >
        <Copy className="text-muted-foreground" />
        Duplicate
      </DropdownMenuItem>
      {blockId ? (
        <DropdownMenuItem
          className={itemClassName}
          onClick={async () => {
            await navigator.clipboard.writeText(blockLink(blockId))
            toast.success("Link to block copied")
            view.focus()
          }}
        >
          <Link className="text-muted-foreground" />
          Copy link to block
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className={itemClassName}
        variant="destructive"
        onClick={() => run(deleteBlockAt(pos))}
      >
        <Trash />
        Delete
      </DropdownMenuItem>
    </>
  )
}

export { BlockActionItems }
