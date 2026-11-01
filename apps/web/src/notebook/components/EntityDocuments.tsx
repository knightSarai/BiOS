import { useId } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { atom, useAtom } from "jotai"
import { FilePlus2, Folder, Paperclip, Search, X } from "lucide-react"
import { formatActivityTimestamp, now, parseUtc } from "@knight-os/server/core"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  entityDocumentsQuery,
  notebookTreeQuery,
} from "@/local-db/notebook-queries"
import {
  useAttachDocument,
  useCreateDocumentFor,
  useDetachDocument,
} from "@/local-db/notebook-mutations"
import { cn } from "@/lib/utils"
import { ownerKeyOf, type Owner } from "../owners"
import { indexFolders, pathTo } from "../tree"
import type { DocumentSummary } from "../use-cases"
import { DocumentIcon } from "./ItemIcon"

type EntityWorkspace = { id: string; slug: string; timezone: string }

type EntityDocumentsProps = {
  owner: Owner
  workspace: EntityWorkspace
  className?: string
}

const sectionLabelClassName =
  "text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase"

const useEntityDocuments = (owner: Owner, workspace: EntityWorkspace) => {
  const { data } = useQuery(entityDocumentsQuery(workspace.id, owner))
  const navigate = useNavigate()
  const create = useCreateDocumentFor(workspace.id)
  const detach = useDetachDocument(workspace.id)
  const ownerKey = ownerKeyOf(owner)

  const newDocument = async () => {
    const documentId = await create.mutateAsync(owner)
    await navigate({
      to: "/$workspace/documents/$documentId",
      params: { workspace: workspace.slug, documentId },
    })
  }

  return {
    data,
    ownerKey,
    creating: create.isPending,
    newDocument: () => void newDocument(),
    detach: (documentId: string) => detach.mutate({ documentId, ownerKey }),
  }
}

function EntityDocuments({
  owner,
  workspace,
  className,
}: EntityDocumentsProps) {
  const { data, ownerKey, creating, newDocument, detach } = useEntityDocuments(
    owner,
    workspace
  )
  const current = parseUtc(now())

  const row = (
    document: DocumentSummary,
    detail: React.ReactNode,
    attached: boolean
  ) => (
    <li key={document.id} className="group/doc relative flex items-center">
      <Link
        to="/$workspace/documents/$documentId"
        params={{ workspace: workspace.slug, documentId: document.id }}
        className="flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-sm transition-colors hover:bg-accent max-md:min-h-11"
      >
        <DocumentIcon icon={document.icon} />
        <span
          dir="auto"
          className={cn(
            "min-w-0 flex-1 truncate",
            !document.title && "text-muted-foreground"
          )}
        >
          {document.title || "Untitled"}
        </span>
        <span className="shrink-0 truncate text-xs text-muted-foreground group-hover/doc:invisible">
          {detail}
        </span>
      </Link>
      {attached ? (
        <button
          type="button"
          aria-label={`Detach ${document.title || "Untitled"}`}
          onClick={() => detach(document.id)}
          className="absolute right-1 hidden size-7 items-center justify-center rounded-md text-muted-foreground group-focus-within/doc:flex group-hover/doc:flex hover:bg-muted hover:text-foreground max-md:static max-md:flex max-md:size-11"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </li>
  )

  return (
    <section
      aria-labelledby={`documents-${ownerKey}`}
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`documents-${ownerKey}`} className="text-sm font-semibold">
          Documents
        </h2>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={newDocument}
            disabled={creating}
          >
            <FilePlus2 data-icon="inline-start" />
            New document
          </Button>
          <AttachDocumentPopover
            owner={owner}
            workspaceId={workspace.id}
            trigger={<Button variant="outline" size="sm" />}
          >
            <Paperclip data-icon="inline-start" />
            Attach
          </AttachDocumentPopover>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className={sectionLabelClassName}>In its folder</h3>
        {data?.folder ? (
          <Link
            to="/$workspace/notebook/folders/$folderId"
            params={{ workspace: workspace.slug, folderId: data.folder.id }}
            className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground hover:text-foreground"
          >
            <Folder aria-hidden className="size-3 shrink-0" />
            <span className="truncate">
              Notebook / {data.folderPath.join(" / ")}
            </span>
          </Link>
        ) : null}
      </div>
      {data && data.inFolder.length > 0 ? (
        <ul className="-mx-2 flex flex-col">
          {data.inFolder.map((document) =>
            row(
              document,
              formatActivityTimestamp(
                document.updatedAt,
                workspace.timezone,
                current
              ),
              false
            )
          )}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No documents yet. New document creates one in this folder.
        </p>
      )}

      {data && data.attached.length > 0 ? (
        <>
          <h3 className={cn(sectionLabelClassName, "pt-2")}>Attached</h3>
          <ul className="-mx-2 flex flex-col">
            {data.attached.map((document) =>
              row(document, document.path.join(" / ") || "Notebook", true)
            )}
          </ul>
        </>
      ) : null}
    </section>
  )
}

const panelIconButtonClassName = "text-muted-foreground max-md:size-11"

function EntityDocumentsPanel({
  owner,
  workspace,
  className,
}: EntityDocumentsProps) {
  const { data, creating, newDocument, detach } = useEntityDocuments(
    owner,
    workspace
  )
  // The panel can be on the page twice (side column and narrow layout), so the id can't come from the owner.
  const headingId = useId()
  const inFolder = data?.inFolder ?? []
  const attached = data?.attached ?? []

  const row = (document: DocumentSummary, attachedRow: boolean) => (
    <li key={document.id} className="group/doc flex items-center">
      <Link
        to="/$workspace/documents/$documentId"
        params={{ workspace: workspace.slug, documentId: document.id }}
        title={document.title || "Untitled"}
        className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 transition-colors hover:bg-accent max-md:min-h-11"
      >
        <DocumentIcon icon={document.icon} />
        <span
          dir="auto"
          className={cn("truncate", !document.title && "text-muted-foreground")}
        >
          {document.title || "Untitled"}
        </span>
      </Link>
      {attachedRow ? (
        <button
          type="button"
          aria-label={`Detach ${document.title || "Untitled"}`}
          onClick={() => detach(document.id)}
          className="hidden size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground group-focus-within/doc:flex group-hover/doc:flex hover:bg-muted hover:text-foreground max-md:flex max-md:size-11"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </li>
  )

  return (
    <section
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-1 text-sm", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="px-2 text-xs text-muted-foreground">
          Documents
        </h2>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New document"
            title="New document"
            onClick={newDocument}
            disabled={creating}
            className={panelIconButtonClassName}
          >
            <FilePlus2 />
          </Button>
          <AttachDocumentPopover
            owner={owner}
            workspaceId={workspace.id}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Attach a document"
                title="Attach a document"
                className={panelIconButtonClassName}
              />
            }
          >
            <Paperclip />
          </AttachDocumentPopover>
        </div>
      </div>

      {inFolder.length === 0 && attached.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">No documents yet.</p>
      ) : null}
      {inFolder.length > 0 ? (
        <ul aria-label="In its folder" className="flex flex-col">
          {inFolder.map((document) => row(document, false))}
        </ul>
      ) : null}
      {attached.length > 0 ? (
        <>
          <h3 className="px-2 pt-2 text-xs text-muted-foreground">Attached</h3>
          <ul className="flex flex-col">
            {attached.map((document) => row(document, true))}
          </ul>
        </>
      ) : null}
      {data?.folder ? (
        <Link
          to="/$workspace/notebook/folders/$folderId"
          params={{ workspace: workspace.slug, folderId: data.folder.id }}
          title={`Notebook / ${data.folderPath.join(" / ")}`}
          className="mt-1 flex min-h-7 items-center gap-1.5 self-start rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-md:min-h-11"
        >
          <Folder aria-hidden className="size-3.5 shrink-0" />
          Open folder
        </Link>
      ) : null}
    </section>
  )
}

const attachQueryAtom = atom("")

function AttachDocumentPopover({
  owner,
  workspaceId,
  trigger,
  children,
}: {
  owner: Owner
  workspaceId: string
  trigger: React.ReactElement
  children: React.ReactNode
}) {
  const [query, setQuery] = useAtom(attachQueryAtom)
  const { data: tree } = useQuery(notebookTreeQuery(workspaceId))
  const { data: own } = useQuery(entityDocumentsQuery(workspaceId, owner))
  const attach = useAttachDocument(workspaceId)
  const taken = new Set([
    ...(own?.inFolder ?? []).map((document) => document.id),
    ...(own?.attached ?? []).map((document) => document.id),
  ])
  const byId = indexFolders(tree?.folders ?? [])
  const needle = query.trim().toLowerCase()
  const candidates = (tree?.documents ?? [])
    .filter((document) => !taken.has(document.id))
    .filter(
      (document) => !needle || document.title.toLowerCase().includes(needle)
    )
    .slice(0, 30)

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <PopoverTrigger render={trigger}>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="flex items-center gap-2 border-b px-3">
          <Search aria-hidden className="size-3.5 text-muted-foreground" />
          <input
            autoFocus
            aria-label="Search documents"
            placeholder="Attach a document…"
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
          />
        </div>
        <ul aria-label="Documents" className="max-h-72 overflow-y-auto p-1">
          {candidates.map((document) => (
            <li key={document.id}>
              <button
                type="button"
                onClick={() =>
                  attach.mutate({
                    documentId: document.id,
                    ownerKey: ownerKeyOf(owner),
                  })
                }
                className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent max-md:min-h-11"
              >
                <DocumentIcon icon={document.icon} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span dir="auto" className="truncate text-sm">
                    {document.title || "Untitled"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {pathTo(document.folderId, byId)
                      .map((folder) => folder.name)
                      .join(" / ") || "Notebook"}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {candidates.length === 0 ? (
            <li className="px-2 py-3 text-xs text-muted-foreground">
              No documents match.
            </li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export { EntityDocuments, EntityDocumentsPanel }
