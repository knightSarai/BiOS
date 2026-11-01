import { Popover } from "@base-ui/react/popover"
import { atom, useAtomValue } from "jotai"
import { FileText } from "lucide-react"
import { StoredIcon } from "@/notebook/components/StoredIcon"
import type { MentionBridge } from "../mention-bridge"

type HoveredMention = { documentId: string; anchor: Element } | null

const createMentionHoverAtom = () => atom<HoveredMention>(null)

type MentionPreviewProps = {
  hoverAtom: ReturnType<typeof createMentionHoverAtom>
  bridge: MentionBridge
}

function MentionPreview({ hoverAtom, bridge }: MentionPreviewProps) {
  const hovered = useAtomValue(hoverAtom)
  const preview = hovered ? bridge.preview(hovered.documentId) : null
  if (!hovered || !preview) return null

  return (
    <Popover.Root open modal={false}>
      <Popover.Portal>
        <Popover.Positioner
          anchor={hovered.anchor}
          side="bottom"
          align="start"
          sideOffset={6}
          className="pointer-events-none isolate z-50"
        >
          <Popover.Popup
            initialFocus={false}
            finalFocus={false}
            className="flex w-72 flex-col gap-1.5 rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <StoredIcon
                value={preview.icon}
                className="text-base"
                fallback={
                  <FileText
                    aria-hidden
                    className="size-4 text-muted-foreground"
                  />
                }
              />
              <span dir="auto" className="truncate">
                {preview.title || "Untitled"}
              </span>
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {preview.path || "Notebook"}
            </span>
            {preview.excerpt ? (
              <span dir="auto" className="line-clamp-3 text-xs leading-relaxed">
                {preview.excerpt}
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              Edited {preview.edited}
            </span>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export { createMentionHoverAtom, MentionPreview }
export type { HoveredMention }
