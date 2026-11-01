import { useQuery } from "@tanstack/react-query"
import { atom, useAtom } from "jotai"
import { Folder, Link2, Search } from "lucide-react"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { ROOT_FOLDER_ID, type FolderRow } from "@/local-db/db"
import { notebookTreeQuery } from "@/local-db/notebook-queries"
import { cn } from "@/lib/utils"
import {
  canMoveFolder,
  foldersInTreeOrder,
  indexFolders,
  isJournalFolder,
  ownerOfFolder,
  pathTo,
} from "../tree"
import { movingAtom } from "./atoms"
import {
  useNotebookActions,
  type NotebookWorkspace,
} from "./use-notebook-actions"

const moveQueryAtom = atom("")

type Destination = {
  id: string
  name: string
  path: string
  depth: number
  owned: boolean
}

const matches = (destination: Destination, query: string) =>
  `${destination.path} ${destination.name}`.toLowerCase().includes(query)

function MovePopover({ workspace }: { workspace: NotebookWorkspace }) {
  const [moving, setMoving] = useAtom(movingAtom)
  const [query, setQuery] = useAtom(moveQueryAtom)
  const { data } = useQuery(notebookTreeQuery(workspace.id))
  const actions = useNotebookActions(workspace)
  const close = () => {
    setMoving(null)
    setQuery("")
  }

  const byId = indexFolders(data?.folders ?? [])
  const currentParentId = moving
    ? moving.kind === "folder"
      ? byId.get(moving.id)?.parentId
      : data?.documents.find((row) => row.id === moving.id)?.folderId
    : undefined
  const allowed = (folder: FolderRow) =>
    !isJournalFolder(folder.role) &&
    folder.id !== currentParentId &&
    (moving?.kind !== "folder" || canMoveFolder(moving.id, folder.id, byId))
  const destinations: Destination[] = foldersInTreeOrder(data?.folders ?? [])
    .filter(({ folder }) => allowed(folder))
    .map(({ folder, depth }) => ({
      id: folder.id,
      name: folder.name,
      path: pathTo(folder.id, byId)
        .slice(0, -1)
        .map((row) => row.name)
        .join(" / "),
      depth,
      owned: folder.ownerKey !== null,
    }))
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? destinations.filter((destination) => matches(destination, needle))
    : destinations
  const canGoToTop = currentParentId !== ROOT_FOLDER_ID
  const keptOwner =
    moving?.kind === "document" && currentParentId
      ? ownerOfFolder(currentParentId, byId)
      : null
  const keptOwnerName = keptOwner
    ? data?.folders.find((folder) => folder.ownerKey === keptOwner)?.name
    : null

  const choose = (folderId: string) => {
    if (!moving) return
    close()
    if (moving.kind === "document") {
      void actions.moveDocumentTo(moving.id, folderId)
    } else {
      void actions.moveFolderTo(moving.id, folderId)
    }
  }

  return (
    <Popover open={moving !== null} onOpenChange={(open) => !open && close()}>
      <PopoverContent
        anchor={moving?.anchor ?? undefined}
        align="start"
        side="bottom"
        className="w-80 gap-0 p-0"
        aria-label={moving ? `Move ${moving.title} to` : "Move to"}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search aria-hidden className="size-3.5 text-muted-foreground" />
          <input
            autoFocus
            aria-label="Search folders"
            placeholder="Move to a folder…"
            defaultValue=""
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              const first = shown[0]
              if (first) choose(first.id)
            }}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
          />
        </div>
        <ul aria-label="Folders" className="max-h-72 overflow-y-auto p-1">
          {canGoToTop && !needle ? (
            <li>
              <button
                type="button"
                onClick={() => choose(ROOT_FOLDER_ID)}
                className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent max-md:min-h-11"
              >
                <Folder aria-hidden className="size-4 text-muted-foreground" />
                Top of the notebook
              </button>
            </li>
          ) : null}
          {shown.map((destination, index) => (
            <li key={destination.id}>
              <button
                type="button"
                onClick={() => choose(destination.id)}
                style={
                  needle
                    ? undefined
                    : { paddingLeft: 8 + destination.depth * 14 }
                }
                className={cn(
                  "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent max-md:min-h-11",
                  needle && index === 0 && "bg-accent"
                )}
              >
                <Folder
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{destination.name}</span>
                  {needle && destination.path ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {destination.path}
                    </span>
                  ) : null}
                </span>
                {destination.owned ? (
                  <Link2
                    aria-hidden
                    className="size-3 shrink-0 text-accent-text"
                  />
                ) : null}
                {needle && index === 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    Enter
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {shown.length === 0 ? (
            <li className="px-2 py-3 text-xs text-muted-foreground">
              No folder matches.
            </li>
          ) : null}
        </ul>
        {keptOwnerName ? (
          <p className="flex items-center gap-1.5 border-t bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Link2 aria-hidden className="size-3" />
            {keptOwnerName} stays attached
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export { MovePopover }
