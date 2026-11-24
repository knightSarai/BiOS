import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { FilePlus2, Folder, Paperclip } from "lucide-react"
import { formatActivityTimestamp, now, parseUtc } from "@knight-os/server/core"
import { Button } from "@/components/ui/button"
import type { ActivityRow } from "@/local-db/db"
import {
  useCreateDocumentFor,
  useDetachDocument,
} from "@/local-db/notebook-mutations"
import { entityDocumentsQuery } from "@/local-db/notebook-queries"
import { cn } from "@/lib/utils"
import { AttachDocumentPopover } from "@/notebook/components/EntityDocuments"
import { DocumentIcon } from "@/notebook/components/ItemIcon"
import { ownerKeyOf, type Owner } from "@/notebook/owners"
import type { DocumentSummary } from "@/notebook/use-cases"

type AreaDocumentsProps = {
  areaId: string
  // The whole workspace: an activity made from a document can be filed in any area.
  activities: ActivityRow[]
  workspace: { id: string; slug: string; timezone: string }
}

type ListedDocument = DocumentSummary & {
  location: string | null
  attached: boolean
}

const activitiesMadeFrom = (activities: ActivityRow[]) => {
  const counts = new Map<string, number>()
  for (const activity of activities) {
    if (activity.origin?.kind !== "document") continue
    const { documentId } = activity.origin
    counts.set(documentId, (counts.get(documentId) ?? 0) + 1)
  }
  return counts
}

// On a phone the edit time joins this line, since the title has no room beside it.
const metaOf = (document: ListedDocument, made: number, edited: string) =>
  [
    document.location
      ? { key: "location", text: document.location, className: "" }
      : null,
    made > 0
      ? {
          key: "made",
          text: made === 1 ? "1 activity" : `${made} activities`,
          className: "text-foreground",
        }
      : null,
    { key: "edited", text: edited, className: "md:hidden" },
  ].filter((part) => part !== null)

const toolbarButtonClassName = "max-md:h-11 max-md:px-3"

function AreaDocuments({ areaId, activities, workspace }: AreaDocumentsProps) {
  const owner: Owner = { kind: "area", id: areaId }
  const { data } = useQuery(entityDocumentsQuery(workspace.id, owner))
  const navigate = useNavigate()
  const create = useCreateDocumentFor(workspace.id)
  const detach = useDetachDocument(workspace.id)
  const current = parseUtc(now())
  const madeFrom = activitiesMadeFrom(activities)
  const folderDepth = data?.folderPath.length ?? 0

  const documents: ListedDocument[] = [
    ...(data?.inFolder ?? []).map((document) => ({
      ...document,
      location: document.path.slice(folderDepth).join(" / ") || null,
      attached: false,
    })),
    ...(data?.attached ?? []).map((document) => ({
      ...document,
      location: ["Attached · Notebook", ...document.path].join(" / "),
      attached: true,
    })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const newDocument = async () => {
    const documentId = await create.mutateAsync(owner)
    await navigate({
      to: "/$workspace/documents/$documentId",
      params: { workspace: workspace.slug, documentId },
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => void newDocument()}
          disabled={create.isPending}
          className={toolbarButtonClassName}
        >
          <FilePlus2 data-icon="inline-start" />
          New document
        </Button>
        <AttachDocumentPopover
          owner={owner}
          workspaceId={workspace.id}
          trigger={
            <Button variant="outline" className={toolbarButtonClassName} />
          }
        >
          <Paperclip data-icon="inline-start" />
          Attach
        </AttachDocumentPopover>
        {data?.folder ? (
          <Button
            variant="ghost"
            className={cn(toolbarButtonClassName, "text-muted-foreground")}
            render={
              <Link
                to="/$workspace/notebook/folders/$folderId"
                params={{ workspace: workspace.slug, folderId: data.folder.id }}
                title={`Notebook / ${data.folderPath.join(" / ")}`}
              />
            }
          >
            <Folder data-icon="inline-start" />
            Open folder
          </Button>
        ) : null}
      </div>

      {data && documents.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No documents yet.
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {documents.map((document) => {
            const title = document.title || "Untitled"
            const edited = formatActivityTimestamp(
              document.updatedAt,
              workspace.timezone,
              current
            )
            const made = madeFrom.get(document.id) ?? 0
            return (
              <li
                key={document.id}
                className="group/doc relative flex items-center gap-2"
              >
                <Link
                  to="/$workspace/documents/$documentId"
                  params={{
                    workspace: workspace.slug,
                    documentId: document.id,
                  }}
                  className="flex min-w-0 flex-1 gap-2.5 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/50"
                >
                  <DocumentIcon icon={document.icon} className="mt-0.5" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline gap-3">
                      <span
                        dir="auto"
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm font-medium",
                          !document.title && "text-muted-foreground"
                        )}
                      >
                        {title}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs text-muted-foreground tabular-nums max-md:hidden",
                          document.attached &&
                            "group-focus-within/doc:invisible group-hover/doc:invisible"
                        )}
                      >
                        {edited}
                      </span>
                    </span>
                    {document.excerpt ? (
                      <span
                        dir="auto"
                        className="truncate text-[13px] text-muted-foreground"
                      >
                        {document.excerpt}
                      </span>
                    ) : null}
                    <span className="truncate text-xs text-muted-foreground">
                      {metaOf(document, made, edited).map((part, index) => (
                        <span key={part.key} className={part.className}>
                          {index > 0 ? (
                            <span aria-hidden className="px-1.5">
                              ·
                            </span>
                          ) : null}
                          {part.text}
                        </span>
                      ))}
                    </span>
                  </span>
                </Link>
                {document.attached ? (
                  <Button
                    variant="outline"
                    aria-label={`Detach ${title}`}
                    onClick={() =>
                      detach.mutate({
                        documentId: document.id,
                        ownerKey: ownerKeyOf(owner),
                      })
                    }
                    className="shrink-0 max-md:mr-2 max-md:h-11 max-md:px-3 md:absolute md:top-2 md:right-2 md:hidden md:group-focus-within/doc:flex md:group-hover/doc:flex"
                  >
                    Detach
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export { AreaDocuments }
