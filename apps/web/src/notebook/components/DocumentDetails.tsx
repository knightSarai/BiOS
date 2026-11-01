import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useSetAtom } from "jotai"
import { Paperclip, Plus, X } from "lucide-react"
import { formatActivityTimestamp, now, parseUtc } from "@knight-os/server/core"
import { documentDetailsQuery } from "@/local-db/notebook-queries"
import { useDetachDocument } from "@/local-db/notebook-mutations"
import { cn } from "@/lib/utils"
import { attachingAtom } from "./atoms"
import { DocumentIcon } from "./ItemIcon"
import { OwnerIcon, ownerSubtitle, ownerTitle } from "./OwnerBadge"
import { OwnerLink } from "./OwnerLink"

type DocumentDetailsProps = {
  documentId: string
  workspace: { id: string; slug: string; timezone: string }
  compact?: boolean
}

const headingClassName =
  "text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase"

const entryClassName =
  "flex min-h-9 min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent max-md:min-h-11"

function DocumentDetails({
  documentId,
  workspace,
  compact,
}: DocumentDetailsProps) {
  const { data } = useQuery(documentDetailsQuery(workspace.id, documentId))
  const setAttaching = useSetAtom(attachingAtom)
  const detach = useDetachDocument(workspace.id)
  if (!data) return null
  const current = parseUtc(now())

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 pb-2 text-xs text-muted-foreground">
        {data.belongsTo ? (
          <OwnerLink
            ownerKey={data.belongsTo.ownerKey}
            workspaceSlug={workspace.slug}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-muted px-2.5 text-foreground"
          >
            <OwnerIcon owner={data.belongsTo} />
            {data.belongsTo.kind === "activity"
              ? `${data.belongsTo.activityKey} `
              : ""}
            {ownerTitle(data.belongsTo)}
          </OwnerLink>
        ) : null}
        {data.attachedTo.map((owner) => (
          <OwnerLink
            key={owner.ownerKey}
            ownerKey={owner.ownerKey}
            workspaceSlug={workspace.slug}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5"
          >
            <OwnerIcon owner={owner} />
            {ownerTitle(owner)}
          </OwnerLink>
        ))}
        {data.mentionedIn.length > 0 ? (
          <span className="px-1">Mentioned in {data.mentionedIn.length}</span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 text-sm">
      {data.belongsTo ? (
        <section className="flex flex-col gap-1">
          <h2 className={headingClassName}>Belongs to</h2>
          <OwnerLink
            ownerKey={data.belongsTo.ownerKey}
            workspaceSlug={workspace.slug}
            className={cn(entryClassName, "-mx-2")}
          >
            <span className="flex h-5 items-center">
              <OwnerIcon owner={data.belongsTo} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span dir="auto" className="truncate">
                {ownerTitle(data.belongsTo)}
              </span>
              <span className="text-xs text-muted-foreground">
                {ownerSubtitle(data.belongsTo)}. This document is in its folder.
              </span>
            </span>
            {data.belongsTo.kind === "activity" ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                {data.belongsTo.activityKey}
              </span>
            ) : null}
          </OwnerLink>
        </section>
      ) : null}

      {data.attachedTo.length === 0 ? (
        <button
          type="button"
          onClick={(event) =>
            setAttaching({ documentId, anchor: event.currentTarget })
          }
          className="-mx-2 flex min-h-8 items-center gap-2 self-start rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-md:min-h-11"
        >
          <Paperclip aria-hidden className="size-3.5" />
          Attach to an area, goal or activity
        </button>
      ) : (
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h2 className={headingClassName}>
              {data.belongsTo ? "Also attached to" : "Attached to"}
            </h2>
            <button
              type="button"
              aria-label="Attach to an area, goal or activity"
              onClick={(event) =>
                setAttaching({ documentId, anchor: event.currentTarget })
              }
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground max-md:size-11"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {data.attachedTo.map((owner) => (
            <div
              key={owner.ownerKey}
              className="group/owner -mx-2 flex items-start"
            >
              <OwnerLink
                ownerKey={owner.ownerKey}
                workspaceSlug={workspace.slug}
                className={entryClassName}
              >
                <span className="flex h-5 items-center">
                  <OwnerIcon owner={owner} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span dir="auto" className="truncate">
                    {ownerTitle(owner)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ownerSubtitle(owner)}
                  </span>
                </span>
              </OwnerLink>
              <button
                type="button"
                aria-label={`Detach from ${ownerTitle(owner)}`}
                onClick={() =>
                  detach.mutate({ documentId, ownerKey: owner.ownerKey })
                }
                className="mt-1 hidden size-7 items-center justify-center rounded-md text-muted-foreground group-focus-within/owner:flex group-hover/owner:flex hover:bg-muted hover:text-foreground max-md:flex max-md:size-11"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </section>
      )}

      {data.mentionedIn.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h2 className={headingClassName}>Mentioned in</h2>
          {data.mentionedIn.map((source) =>
            source.kind === "document" ? (
              <Link
                key={`document:${source.document.id}`}
                to="/$workspace/documents/$documentId"
                params={{
                  workspace: workspace.slug,
                  documentId: source.document.id,
                }}
                className={cn(entryClassName, "-mx-2")}
              >
                <span className="flex h-5 items-center">
                  <DocumentIcon
                    icon={source.document.icon}
                    journal={source.document.journal}
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span dir="auto" className="truncate">
                    {source.document.title || "Untitled"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {source.document.journal ? "Journal page" : "Document"}
                  </span>
                </span>
              </Link>
            ) : (
              <OwnerLink
                key={source.owner.ownerKey}
                ownerKey={source.owner.ownerKey}
                workspaceSlug={workspace.slug}
                className={cn(entryClassName, "-mx-2")}
              >
                <span className="flex h-5 items-center">
                  <OwnerIcon owner={source.owner} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span dir="auto" className="truncate">
                    {ownerTitle(source.owner)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {source.owner.kind === "activity"
                      ? "Activity body"
                      : `${ownerSubtitle(source.owner)} page`}
                  </span>
                </span>
              </OwnerLink>
            )
          )}
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Edited{" "}
        {formatActivityTimestamp(
          data.document.updatedAt,
          workspace.timezone,
          current
        )}
      </p>
    </div>
  )
}

export { DocumentDetails }
