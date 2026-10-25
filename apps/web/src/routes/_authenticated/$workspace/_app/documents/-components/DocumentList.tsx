import { Link } from "@tanstack/react-router"
import { FileText } from "lucide-react"
import { formatActivityTimestamp, now, parseUtc } from "@knight-os/server/core"
import type { DocumentRow } from "@/local-db/db"

type DocumentListProps = {
  documents: DocumentRow[]
  workspaceSlug: string
  timezone: string
}

function DocumentList({
  documents,
  workspaceSlug,
  timezone,
}: DocumentListProps) {
  const current = parseUtc(now())

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {documents.map((document) => (
        <li key={document.id}>
          <Link
            to="/$workspace/documents/$documentId"
            params={{ workspace: workspaceSlug, documentId: document.id }}
            className="flex min-h-11 items-center gap-3 px-4 py-2 transition-colors hover:bg-accent"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span
              dir="auto"
              className={
                document.title
                  ? "min-w-0 flex-1 truncate"
                  : "min-w-0 flex-1 truncate text-muted-foreground"
              }
            >
              {document.title || "Untitled"}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatActivityTimestamp(document.updatedAt, timezone, current)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export { DocumentList }
