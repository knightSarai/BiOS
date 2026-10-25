import { useSyncExternalStore } from "react"
import { Toolbar } from "@base-ui/react/toolbar"
import { useAtom, useAtomValue } from "jotai"
import {
  Bold,
  Ellipsis,
  Italic,
  KeyboardOff,
  Link,
  ListChecks,
  ListIndentDecrease,
  ListIndentIncrease,
  Plus,
  Type,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  activeBlockKind,
  activeLinkHref,
  indentListItem,
  isInTitle,
  isMarkActive,
  movableBlockPos,
  outdentListItem,
  toggleFormat,
  turnInto,
} from "../commands"
import { openInsertMenu, readUi } from "../editor-ui"
import { marks } from "../schema"
import { BlockActionItems } from "./BlockActionItems"
import type { EditorAtoms } from "./editor-atoms"
import { LinkForm } from "./LinkForm"
import { TurnIntoMenu } from "./TurnIntoMenu"

const subscribeToViewport = (onChange: () => void) => {
  const viewport = window.visualViewport
  viewport?.addEventListener("resize", onChange)
  viewport?.addEventListener("scroll", onChange)
  return () => {
    viewport?.removeEventListener("resize", onChange)
    viewport?.removeEventListener("scroll", onChange)
  }
}

const keyboardInset = () => {
  const viewport = window.visualViewport
  if (!viewport) return 0
  return Math.max(
    0,
    Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
  )
}

const barButtonClassName =
  "flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none select-none active:bg-muted aria-pressed:bg-selection aria-pressed:text-foreground disabled:opacity-40 [&_svg]:size-5"

const keepFocus = (event: React.MouseEvent) => event.preventDefault()

type MobileEditorBarProps = {
  atoms: EditorAtoms
  blockLink: (blockId: string) => string
}

function MobileEditorBar({ atoms, blockLink }: MobileEditorBarProps) {
  const snapshot = useAtomValue(atoms.snapshot)
  const [linkDraft, setLinkDraft] = useAtom(atoms.linkDraft)
  const [menuOpen, setMenuOpen] = useAtom(atoms.menuOpen)
  const inset = useSyncExternalStore(
    subscribeToViewport,
    keyboardInset,
    () => 0
  )
  if (!snapshot) return null

  const { view, state } = snapshot
  if (!readUi(state).focused && linkDraft === null && !menuOpen) return null

  const inTitle = isInTitle(state)
  const inCode = Boolean(state.selection.$from.parent.type.spec.code)
  const active = activeBlockKind(state)
  const blockPos = movableBlockPos(state)
  const linkHref = activeLinkHref(state)
  const canLink =
    !inTitle && !inCode && (!state.selection.empty || linkHref !== null)

  return (
    <div
      className="fixed inset-x-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      style={{ bottom: inset }}
    >
      {linkDraft !== null ? (
        <div className="px-2 py-1">
          <LinkForm
            view={view}
            draft={linkDraft}
            onClose={() => setLinkDraft(null)}
          />
        </div>
      ) : (
        <Toolbar.Root
          aria-label="Editor tools"
          onMouseDown={keepFocus}
          className="flex [scrollbar-width:none] items-center gap-0.5 overflow-x-auto px-1 py-1 [&::-webkit-scrollbar]:hidden"
        >
          <Toolbar.Button
            aria-label="Insert block"
            disabled={inTitle || inCode}
            className={barButtonClassName}
            onMouseDown={keepFocus}
            onClick={() => openInsertMenu(view.state, view.dispatch)}
          >
            <Plus />
          </Toolbar.Button>
          <TurnIntoMenu
            view={view}
            active={active}
            side="top"
            onOpenChange={setMenuOpen}
            trigger={
              <Toolbar.Button
                aria-label="Turn into"
                disabled={inTitle}
                className={barButtonClassName}
                onMouseDown={keepFocus}
              >
                <Type />
              </Toolbar.Button>
            }
          />
          <Toolbar.Button
            aria-label="Checklist"
            aria-pressed={active === "task_list"}
            disabled={inTitle}
            className={barButtonClassName}
            onMouseDown={keepFocus}
            onClick={() =>
              turnInto(active === "task_list" ? "paragraph" : "task_list")(
                view.state,
                view.dispatch
              )
            }
          >
            <ListChecks />
          </Toolbar.Button>
          <Toolbar.Separator className="mx-0.5 h-6 w-px shrink-0 bg-border" />
          <Toolbar.Button
            aria-label="Bold"
            aria-pressed={isMarkActive(state, marks.strong)}
            disabled={inTitle || inCode}
            className={barButtonClassName}
            onMouseDown={keepFocus}
            onClick={() =>
              toggleFormat(marks.strong)(view.state, view.dispatch)
            }
          >
            <Bold />
          </Toolbar.Button>
          <Toolbar.Button
            aria-label="Italic"
            aria-pressed={isMarkActive(state, marks.em)}
            disabled={inTitle || inCode}
            className={barButtonClassName}
            onMouseDown={keepFocus}
            onClick={() => toggleFormat(marks.em)(view.state, view.dispatch)}
          >
            <Italic />
          </Toolbar.Button>
          <Toolbar.Button
            aria-label="Link"
            aria-pressed={linkHref !== null}
            disabled={!canLink}
            className={barButtonClassName}
            onMouseDown={keepFocus}
            onClick={() => setLinkDraft(linkHref ?? "")}
          >
            <Link />
          </Toolbar.Button>
          <Toolbar.Separator className="mx-0.5 h-6 w-px shrink-0 bg-border" />
          <Toolbar.Button
            aria-label="Outdent"
            disabled={!outdentListItem(state)}
            className={barButtonClassName}
            onMouseDown={keepFocus}
            onClick={() => outdentListItem(view.state, view.dispatch)}
          >
            <ListIndentDecrease />
          </Toolbar.Button>
          <Toolbar.Button
            aria-label="Indent"
            disabled={!indentListItem(state)}
            className={barButtonClassName}
            onMouseDown={keepFocus}
            onClick={() => indentListItem(view.state, view.dispatch)}
          >
            <ListIndentIncrease />
          </Toolbar.Button>
          {blockPos !== null ? (
            <DropdownMenu onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger
                render={
                  <Toolbar.Button
                    aria-label="Block actions"
                    className={barButtonClassName}
                    onMouseDown={keepFocus}
                  />
                }
              >
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="end"
                className="w-60"
                finalFocus={{ current: view.dom }}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Block</DropdownMenuLabel>
                  <BlockActionItems
                    view={view}
                    pos={blockPos}
                    blockLink={blockLink}
                  />
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Toolbar.Button
            aria-label="Hide keyboard"
            className={cn(barButtonClassName, "ml-auto")}
            onClick={() => view.dom.blur()}
          >
            <KeyboardOff />
          </Toolbar.Button>
        </Toolbar.Root>
      )}
    </div>
  )
}

export { MobileEditorBar }
