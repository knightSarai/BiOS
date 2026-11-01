import { Popover } from "@base-ui/react/popover"
import { useAtomValue } from "jotai"
import { CalendarDays, FileText } from "lucide-react"
import type { EditorView } from "prosemirror-view"
import { StatusIcon } from "@/activities/components/StatusIcon"
import { cn } from "@/lib/utils"
import type { MentionBridge } from "../mention-bridge"
import {
  applyMention,
  closeMention,
  readMention,
  setMentionIndex,
} from "../mention-plugin"
import type { EditorAtoms } from "./editor-atoms"

const caretAnchor = (view: EditorView, pos: number) => ({
  getBoundingClientRect: () => {
    const coords = view.coordsAtPos(pos)
    return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top)
  },
})

type MentionMenuProps = {
  atoms: EditorAtoms
  bridge: MentionBridge
  menuId: string
}

function MentionMenu({ atoms, bridge, menuId }: MentionMenuProps) {
  const snapshot = useAtomValue(atoms.snapshot)
  const mention = snapshot ? readMention(snapshot.state) : null
  if (!snapshot || !mention) return null

  const { view } = snapshot
  const candidates = bridge.search(mention.query)

  return (
    <Popover.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) closeMention(view)
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={caretAnchor(view, mention.from)}
          side="bottom"
          align="start"
          sideOffset={6}
          className="isolate z-50"
        >
          <Popover.Popup
            initialFocus={false}
            finalFocus={false}
            className="max-h-[min(22rem,var(--available-height))] w-72 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
          >
            {candidates.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                No documents or activities match
              </p>
            ) : (
              <div id={menuId} role="listbox" aria-label="Mention">
                {candidates.map((candidate, index) => {
                  const active = index === mention.index
                  return (
                    <div
                      key={`${candidate.kind}:${candidate.id}`}
                      role="option"
                      aria-selected={active}
                      ref={
                        active
                          ? (element) =>
                              element?.scrollIntoView({ block: "nearest" })
                          : undefined
                      }
                      className={cn(
                        "flex min-h-9 cursor-default items-center gap-2 rounded-md px-2 text-xs select-none max-md:min-h-11",
                        active && "bg-accent text-accent-foreground"
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => {
                        if (!active) setMentionIndex(view, index)
                      }}
                      onClick={() =>
                        applyMention(candidate)(view.state, view.dispatch)
                      }
                    >
                      {candidate.kind === "document" ? (
                        candidate.icon ? (
                          <span
                            aria-hidden
                            className="w-4 text-center text-[13px]"
                          >
                            {candidate.icon}
                          </span>
                        ) : candidate.journal ? (
                          <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        )
                      ) : (
                        <StatusIcon status={candidate.status} />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span dir="auto" className="truncate text-sm">
                          {candidate.title || "Untitled"}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {candidate.kind === "document"
                            ? candidate.path || "Notebook"
                            : `Activity ${candidate.key}`}
                        </span>
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

export { MentionMenu }
