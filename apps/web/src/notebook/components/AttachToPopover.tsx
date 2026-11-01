import { useQuery } from "@tanstack/react-query"
import { atom, useAtom } from "jotai"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { useAttachDocument } from "@/local-db/notebook-mutations"
import { documentDetailsQuery, ownersQuery } from "@/local-db/notebook-queries"
import { attachingAtom } from "./atoms"
import { OwnerIcon, ownerSubtitle, ownerTitle } from "./OwnerBadge"
import type { NotebookWorkspace } from "./use-notebook-actions"

const attachToQueryAtom = atom("")

function AttachToPopover({ workspace }: { workspace: NotebookWorkspace }) {
  const [attaching, setAttaching] = useAtom(attachingAtom)
  const [query, setQuery] = useAtom(attachToQueryAtom)
  const { data: owners } = useQuery({
    ...ownersQuery(workspace.id),
    enabled: attaching !== null,
  })
  const { data: details } = useQuery({
    ...documentDetailsQuery(workspace.id, attaching?.documentId ?? ""),
    enabled: attaching !== null,
  })
  const attach = useAttachDocument(workspace.id)
  const close = () => {
    setAttaching(null)
    setQuery("")
  }
  const taken = new Set([
    ...(details?.belongsTo ? [details.belongsTo.ownerKey] : []),
    ...(details?.attachedTo ?? []).map((owner) => owner.ownerKey),
  ])
  const needle = query.trim().toLowerCase()
  const shown = (owners ?? [])
    .filter((owner) => !taken.has(owner.ownerKey))
    .filter((owner) => {
      if (!needle) return true
      const key = owner.kind === "activity" ? owner.activityKey : ""
      return `${key} ${owner.title}`.toLowerCase().includes(needle)
    })
    .slice(0, 40)

  const choose = async (
    ownerKey: (typeof shown)[number]["ownerKey"],
    label: string
  ) => {
    if (!attaching) return
    const documentId = attaching.documentId
    close()
    await attach.mutateAsync({ documentId, ownerKey })
    toast.success(`Attached to ${label}`)
  }

  return (
    <Popover
      open={attaching !== null}
      onOpenChange={(open) => !open && close()}
    >
      <PopoverContent
        anchor={attaching?.anchor ?? undefined}
        align="start"
        className="w-80 gap-0 p-0"
        aria-label="Attach to"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search aria-hidden className="size-3.5 text-muted-foreground" />
          <input
            autoFocus
            aria-label="Search areas, goals and activities"
            placeholder="Attach to an activity, goal or area…"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              const first = shown[0]
              if (first) void choose(first.ownerKey, ownerTitle(first))
            }}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
          />
        </div>
        <ul
          aria-label="Areas, goals and activities"
          className="max-h-72 overflow-y-auto p-1"
        >
          {shown.map((owner) => (
            <li key={owner.ownerKey}>
              <button
                type="button"
                onClick={() => void choose(owner.ownerKey, ownerTitle(owner))}
                className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent max-md:min-h-11"
              >
                <OwnerIcon owner={owner} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span dir="auto" className="truncate text-sm">
                    {ownerTitle(owner)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {ownerSubtitle(owner)}
                  </span>
                </span>
                {owner.kind === "activity" ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {owner.activityKey}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {shown.length === 0 ? (
            <li className="px-2 py-3 text-xs text-muted-foreground">
              Nothing matches.
            </li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export { AttachToPopover }
