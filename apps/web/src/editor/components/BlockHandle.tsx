import { useAtom, useAtomValue } from "jotai"
import { GripVertical, Plus } from "lucide-react"
import type { Node } from "prosemirror-model"
import { NodeSelection } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  blockKindAt,
  insertParagraphAfter,
  selectBlockStart,
} from "../commands"
import { openSlashMenu, readUi } from "../editor-ui"
import { nodes } from "../schema"
import { BlockActionItems } from "./BlockActionItems"
import type { EditorAtoms } from "./editor-atoms"
import { TurnIntoItems } from "./TurnIntoMenu"

const HANDLE_SIZE = 24
const LIST_MARKER_WIDTH = 22

const firstTextPos = (node: Node, pos: number) => {
  if (node.isTextblock) return pos + 1
  let found: number | null = null
  node.descendants((child, offset) => {
    if (found !== null) return false
    if (child.isTextblock) found = pos + 1 + offset + 1
    return true
  })
  return found
}

const handlePosition = (view: EditorView, pos: number, node: Node) => {
  const dom = view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return null
  const host = view.dom.getBoundingClientRect()
  const rect = dom.getBoundingClientRect()
  const textPos = firstTextPos(node, pos)
  const lineCenter =
    textPos === null
      ? rect.top + rect.height / 2
      : (() => {
          const coords = view.coordsAtPos(textPos)
          return (coords.top + coords.bottom) / 2
        })()
  const markerOffset = node.type === nodes.list_item ? LIST_MARKER_WIDTH : 0
  return {
    top: lineCenter - host.top - HANDLE_SIZE / 2,
    left: rect.left - host.left - markerOffset - HANDLE_SIZE * 2 - 4,
  }
}

const startDrag = (view: EditorView, pos: number, event: React.DragEvent) => {
  const node = view.state.doc.nodeAt(pos)
  const dom = view.nodeDOM(pos)
  if (!node) return
  const selection = NodeSelection.create(view.state.doc, pos)
  view.dispatch(view.state.tr.setSelection(selection))
  event.dataTransfer.effectAllowed = "copyMove"
  event.dataTransfer.setData("text/plain", node.textContent)
  if (dom instanceof HTMLElement) event.dataTransfer.setDragImage(dom, 0, 0)
  view.dragging = { slice: selection.content(), move: true }
}

const endDrag = (view: EditorView) => {
  view.dragging = null
}

type BlockHandleProps = {
  atoms: EditorAtoms
  blockLink: (blockId: string) => string
}

function BlockHandle({ atoms, blockLink }: BlockHandleProps) {
  const snapshot = useAtomValue(atoms.snapshot)
  const [menuPos, setMenuPos] = useAtom(atoms.blockMenuPos)
  if (!snapshot) return null

  const { view, state } = snapshot
  const pos = menuPos ?? readUi(state).hoverPos
  const node = pos === null ? null : state.doc.nodeAt(pos)
  if (pos === null || !node || node.type === nodes.title) return null
  const position = handlePosition(view, pos, node)
  if (!position) return null

  const selectBlock = selectBlockStart(pos)
  const canTurnInto = node.type !== nodes.horizontal_rule

  return (
    <div
      className="absolute z-10 flex items-center text-muted-foreground/70 max-md:hidden"
      style={{ top: position.top, left: position.left }}
    >
      <button
        type="button"
        aria-label="Insert block below"
        className="flex size-6 items-center justify-center rounded-sm hover:bg-muted hover:text-foreground"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          insertParagraphAfter(pos)(view.state, view.dispatch)
          openSlashMenu(view.state, view.dispatch)
          view.focus()
        }}
      >
        <Plus className="size-4" />
      </button>
      <DropdownMenu onOpenChange={(open) => setMenuPos(open ? pos : null)}>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              draggable
              aria-label="Drag to move, or click for block actions"
              className="flex h-6 w-5 cursor-grab items-center justify-center rounded-sm hover:bg-muted hover:text-foreground active:cursor-grabbing"
              onDragStart={(event) => startDrag(view, pos, event)}
              onDragEnd={() => endDrag(view)}
            />
          }
        >
          <GripVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="start"
          className="w-56"
          finalFocus={{ current: view.dom }}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>Block</DropdownMenuLabel>
            {canTurnInto ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="min-h-8">
                  Turn into
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-60">
                  <TurnIntoItems
                    view={view}
                    before={selectBlock}
                    active={blockKindAt(state, pos)}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            <DropdownMenuSeparator />
            <BlockActionItems view={view} pos={pos} blockLink={blockLink} />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export { BlockHandle }
