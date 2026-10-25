import { Popover } from "@base-ui/react/popover"
import { Toolbar } from "@base-ui/react/toolbar"
import { useAtom, useAtomValue } from "jotai"
import {
  Bold,
  ChevronDown,
  Code,
  Italic,
  Link,
  Strikethrough,
} from "lucide-react"
import type { MarkType } from "prosemirror-model"
import { TextSelection, type EditorState } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { blockCatalog } from "../block-catalog"
import {
  activeBlockKind,
  activeLinkHref,
  isInTitle,
  isMarkActive,
  toggleFormat,
} from "../commands"
import { readUi } from "../editor-ui"
import { marks } from "../schema"
import { blockIcons } from "./block-icons"
import type { EditorAtoms } from "./editor-atoms"
import { LinkForm } from "./LinkForm"
import { shortcutKeys } from "./shortcut-keys"
import { TurnIntoMenu } from "./TurnIntoMenu"

const toolbarButtonClassName =
  "flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-muted-foreground outline-none select-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 aria-pressed:bg-selection aria-pressed:text-foreground [&_svg]:size-3.5"

const selectionAnchor = (view: EditorView) => ({
  getBoundingClientRect: () => {
    const { from, to } = view.state.selection
    const start = view.coordsAtPos(from)
    const end = view.coordsAtPos(to, -1)
    const left = Math.min(start.left, end.left)
    const right =
      start.top === end.top ? Math.max(start.right, end.right) : left
    return new DOMRect(
      left,
      start.top,
      Math.max(right - left, 1),
      end.bottom - start.top
    )
  },
})

const hasFormattableSelection = (state: EditorState) => {
  const { selection } = state
  return (
    selection instanceof TextSelection &&
    !selection.empty &&
    !isInTitle(state) &&
    !selection.$from.parent.type.spec.code
  )
}

const formatButtons: {
  mark: MarkType
  label: string
  keys: string
  icon: typeof Bold
}[] = [
  { mark: marks.strong, label: "Bold", keys: "Mod-b", icon: Bold },
  { mark: marks.em, label: "Italic", keys: "Mod-i", icon: Italic },
  {
    mark: marks.strike,
    label: "Strikethrough",
    keys: "Mod-Shift-x",
    icon: Strikethrough,
  },
  { mark: marks.code, label: "Inline code", keys: "Mod-e", icon: Code },
]

type SelectionToolbarProps = {
  atoms: EditorAtoms
}

function SelectionToolbar({ atoms }: SelectionToolbarProps) {
  const snapshot = useAtomValue(atoms.snapshot)
  const [linkDraft, setLinkDraft] = useAtom(atoms.linkDraft)
  const [menuOpen, setMenuOpen] = useAtom(atoms.menuOpen)
  if (!snapshot) return null

  const { view, state } = snapshot
  const ui = readUi(state)
  const editingLink = linkDraft !== null
  const open =
    editingLink ||
    menuOpen ||
    (ui.focused && !ui.pointerDown && hasFormattableSelection(state))
  if (!open) return null

  const active = activeBlockKind(state)
  const ActiveIcon = active ? blockIcons[active] : blockIcons.paragraph
  const activeLabel =
    blockCatalog.find((item) => item.kind === active)?.label ?? "Text"

  return (
    <Popover.Root
      open
      modal={false}
      onOpenChange={(next) => {
        if (!next && editingLink) setLinkDraft(null)
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={selectionAnchor(view)}
          side="top"
          align="start"
          sideOffset={8}
          className="isolate z-40"
        >
          <Popover.Popup
            initialFocus={false}
            finalFocus={false}
            className="rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
          >
            {editingLink ? (
              <LinkForm
                view={view}
                draft={linkDraft}
                onClose={() => setLinkDraft(null)}
              />
            ) : (
              <Toolbar.Root
                aria-label="Format text"
                className="flex items-center gap-0.5"
              >
                <TurnIntoMenu
                  view={view}
                  active={active}
                  onOpenChange={setMenuOpen}
                  trigger={
                    <Toolbar.Button
                      className={toolbarButtonClassName}
                      aria-label={`Turn into, current: ${activeLabel}`}
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      <ActiveIcon />
                      <span className="text-xs">{activeLabel}</span>
                      <ChevronDown />
                    </Toolbar.Button>
                  }
                />
                <Toolbar.Separator className="mx-0.5 h-4 w-px bg-border" />
                {formatButtons.map(({ mark, label, keys, icon: Icon }) => (
                  <Toolbar.Button
                    key={label}
                    aria-label={label}
                    title={`${label} (${shortcutKeys(keys).join(" ")})`}
                    aria-pressed={isMarkActive(state, mark)}
                    className={toolbarButtonClassName}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      toggleFormat(mark)(view.state, view.dispatch)
                    }
                  >
                    <Icon />
                  </Toolbar.Button>
                ))}
                <Toolbar.Separator className="mx-0.5 h-4 w-px bg-border" />
                <Toolbar.Button
                  aria-label="Link"
                  title={`Link (${shortcutKeys("Mod-k").join(" ")})`}
                  aria-pressed={activeLinkHref(state) !== null}
                  className={toolbarButtonClassName}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setLinkDraft(activeLinkHref(view.state) ?? "")}
                >
                  <Link />
                </Toolbar.Button>
              </Toolbar.Root>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export { SelectionToolbar }
