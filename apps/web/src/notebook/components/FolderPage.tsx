import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { FilePlus2, FolderPlus, Link2 } from "lucide-react"
import { formatActivityTimestamp, now, parseUtc } from "@knight-os/server/core"
import { EmptyState } from "@/components/common/EmptyState"
import { Button } from "@/components/ui/button"
import { ROOT_FOLDER_ID, type DocumentRow, type FolderRow } from "@/local-db/db"
import { notebookTreeQuery } from "@/local-db/notebook-queries"
import { Page } from "@layout/content/Page"
import { parseOwnerKey } from "../owners"
import { buildTree, type TreeNode } from "../tree"
import { DocumentIcon, FolderIcon } from "./ItemIcon"
import { OwnerLink } from "./OwnerLink"
import { useNotebookActions } from "./use-notebook-actions"

type FolderPageProps = {
  workspace: { id: string; slug: string; timezone: string }
  folderId: string
}

type Node = TreeNode<FolderRow, DocumentRow>

const countLabel = (node: Node & { kind: "folder" }) => {
  const folders = node.children.filter(
    (child) => child.kind === "folder"
  ).length
  const documents = node.children.length - folders
  if (node.children.length === 0) return "Empty"
  const parts = [
    folders ? `${folders} ${folders === 1 ? "folder" : "folders"}` : "",
    documents
      ? `${documents} ${documents === 1 ? "document" : "documents"}`
      : "",
  ]
  return parts.filter(Boolean).join(" · ")
}

const ownerKindLabel = { area: "area", activity: "activity", goal: "goal" }

function FolderPage({ workspace, folderId }: FolderPageProps) {
  const { data } = useQuery(notebookTreeQuery(workspace.id))
  const actions = useNotebookActions(workspace)
  if (!data) return null
  const tree = buildTree(data.folders, data.documents)
  const findFolder = (nodes: Node[]): (Node & { kind: "folder" }) | null => {
    for (const node of nodes) {
      if (node.kind !== "folder") continue
      if (node.folder.id === folderId) return node
      const found = findFolder(node.children)
      if (found) return found
    }
    return null
  }
  const folder = folderId === ROOT_FOLDER_ID ? null : findFolder(tree)
  const children = folderId === ROOT_FOLDER_ID ? tree : (folder?.children ?? [])
  const title = folder?.folder.name ?? "Notebook"
  const owner = folder?.folder.ownerKey
    ? parseOwnerKey(folder.folder.ownerKey)
    : null
  const current = parseUtc(now())

  return (
    <Page.Layout>
      <Page.Header>
        <Page.HeaderContent>
          <Page.Title>{title}</Page.Title>
          {owner && folder?.folder.ownerKey ? (
            <OwnerLink
              ownerKey={folder.folder.ownerKey}
              workspaceSlug={workspace.slug}
              className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Link2 aria-hidden className="size-3 text-accent-text" />
              Documents of this {ownerKindLabel[owner.kind]}. Open the{" "}
              {ownerKindLabel[owner.kind]}
            </OwnerLink>
          ) : null}
        </Page.HeaderContent>
        <Page.HeaderActions>
          <Button
            variant="outline"
            onClick={() => void actions.newFolder(folderId)}
          >
            <FolderPlus data-icon="inline-start" />
            Folder
          </Button>
          <Button onClick={() => void actions.newDocument(folderId)}>
            <FilePlus2 data-icon="inline-start" />
            Document
          </Button>
        </Page.HeaderActions>
      </Page.Header>
      <Page.Body>
        <Page.ScrollArea>
          <Page.Content>
            {children.length === 0 ? (
              <EmptyState.Root>
                <EmptyState.Icon icon={FilePlus2} />
                <EmptyState.Text>
                  <EmptyState.Title>Nothing here yet</EmptyState.Title>
                  <EmptyState.Description>
                    Add a document or a folder. Everything stays on this device.
                  </EmptyState.Description>
                </EmptyState.Text>
              </EmptyState.Root>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {children.map((node) =>
                  node.kind === "folder" ? (
                    <li key={node.folder.id}>
                      <Link
                        to="/$workspace/notebook/folders/$folderId"
                        params={{
                          workspace: workspace.slug,
                          folderId: node.folder.id,
                        }}
                        className="flex min-h-11 items-center gap-3 px-4 py-2 transition-colors hover:bg-accent"
                      >
                        <FolderIcon />
                        <span className="min-w-0 flex-1 truncate">
                          {node.folder.name}
                        </span>
                        {node.folder.ownerKey ? (
                          <Link2
                            aria-label="Used by an area, goal or activity"
                            className="size-3 shrink-0 text-accent-text"
                          />
                        ) : null}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {countLabel(node)}
                        </span>
                      </Link>
                    </li>
                  ) : (
                    <li key={node.document.id}>
                      <Link
                        to="/$workspace/documents/$documentId"
                        params={{
                          workspace: workspace.slug,
                          documentId: node.document.id,
                        }}
                        className="flex min-h-11 items-center gap-3 px-4 py-2 transition-colors hover:bg-accent"
                      >
                        <DocumentIcon icon={node.document.icon} />
                        <span
                          dir="auto"
                          className={
                            node.document.title
                              ? "min-w-0 flex-1 truncate"
                              : "min-w-0 flex-1 truncate text-muted-foreground"
                          }
                        >
                          {node.document.title || "Untitled"}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatActivityTimestamp(
                            node.document.updatedAt,
                            workspace.timezone,
                            current
                          )}
                        </span>
                      </Link>
                    </li>
                  )
                )}
              </ul>
            )}
          </Page.Content>
        </Page.ScrollArea>
      </Page.Body>
    </Page.Layout>
  )
}

export { FolderPage }
