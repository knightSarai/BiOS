import { useSuspenseQuery } from "@tanstack/react-query"
import { useLocation, useRouter } from "@tanstack/react-router"
import { useActivityBridge } from "@/activities/use-activity-bridge"
import { NotFound } from "@/components/common/NotFound"
import { DocumentEditor } from "@/editor/components/DocumentEditor"
import { JournalStrip } from "@/journal/components/JournalStrip"
import { useSyncDocumentTitle } from "@/local-db/document-mutations"
import { documentQuery } from "@/local-db/document-queries"
import { useSaveDocumentContent } from "@/local-db/notebook-mutations"
import { Page } from "@layout/content/Page"
import { DocumentDetails } from "./DocumentDetails"
import { PageIconButton } from "./PageIconButton"
import { useMentionBridge } from "./use-mention-bridge"

const BLOCK_HASH_PREFIX = "block-"

type DocumentViewProps = {
  workspace: { id: string; name: string; slug: string; timezone: string }
  documentId: string
}

function DocumentView({ workspace, documentId }: DocumentViewProps) {
  const router = useRouter()
  const hash = useLocation({ select: (location) => location.hash })
  const { data: document } = useSuspenseQuery(
    documentQuery(workspace.id, documentId)
  )
  const saveContent = useSaveDocumentContent(workspace.id, documentId)
  const syncTitle = useSyncDocumentTitle(workspace.id, documentId)
  const activities = useActivityBridge(workspace, {
    kind: "document",
    documentId,
  })
  const mentions = useMentionBridge(workspace)
  if (!document) {
    return (
      <NotFound className="flex-1 py-20">
        <NotFound.Title>Document not found</NotFound.Title>
        <NotFound.Description>
          It may have been deleted, or it lives on another device.
        </NotFound.Description>
      </NotFound>
    )
  }

  const blockLink = (blockId: string) => {
    const { href } = router.buildLocation({
      to: "/$workspace/documents/$documentId",
      params: { workspace: workspace.slug, documentId },
      hash: `${BLOCK_HASH_PREFIX}${blockId}`,
    })
    return new URL(href, globalThis.document.baseURI).href
  }

  const detailsWorkspace = {
    id: workspace.id,
    slug: workspace.slug,
    timezone: workspace.timezone,
  }

  return (
    <Page.Layout>
      <Page.ScrollArea>
        <div className="mx-auto flex w-full max-w-5xl gap-10 px-4 pt-8 pb-16 md:px-16 md:pt-14">
          <div className="group/page min-w-0 flex-1">
            {document.journal ? (
              <JournalStrip journal={document.journal} workspace={workspace} />
            ) : null}
            <PageIconButton
              target={{ kind: "document", id: documentId }}
              icon={document.icon}
            />
            <DocumentEditor
              key={documentId}
              ydoc={document.content}
              focusBlockId={
                hash.startsWith(BLOCK_HASH_PREFIX)
                  ? hash.slice(BLOCK_HASH_PREFIX.length)
                  : undefined
              }
              blockLink={blockLink}
              onContentChange={saveContent.mutate}
              onLoaded={syncTitle.mutate}
              activities={activities}
              mentions={mentions}
              titleAccessory={
                <div className="lg:hidden">
                  <DocumentDetails
                    documentId={documentId}
                    workspace={detailsWorkspace}
                    compact
                  />
                </div>
              }
            />
          </div>
          <aside
            aria-label="Document details"
            className="w-64 shrink-0 max-lg:hidden lg:sticky lg:top-14 lg:self-start"
          >
            <DocumentDetails
              documentId={documentId}
              workspace={detailsWorkspace}
            />
          </aside>
        </div>
      </Page.ScrollArea>
    </Page.Layout>
  )
}

export { DocumentView }
