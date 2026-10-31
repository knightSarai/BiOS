import { useSuspenseQuery } from "@tanstack/react-query"
import {
  createFileRoute,
  notFound,
  useLocation,
  useRouter,
} from "@tanstack/react-router"
import { useActivityBridge } from "@/activities/use-activity-bridge"
import { NotFound } from "@/components/common/NotFound"
import { DocumentEditor } from "@/editor/components/DocumentEditor"
import {
  useSaveDocumentTitle,
  useSyncDocumentTitle,
} from "@/local-db/document-mutations"
import { documentQuery } from "@/local-db/document-queries"
import { Page } from "@layout/content/Page"
import { DocumentCrumb } from "./-components/DocumentCrumb"

const BLOCK_HASH_PREFIX = "block-"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/documents/$documentId"
)({
  staticData: { crumb: { label: "Document", Title: DocumentCrumb } },
  loader: async ({ context, params }) => {
    const query = documentQuery(context.workspace.id, params.documentId)
    const document = await context.queryClient.ensureQueryData(query)
    if (!document) {
      context.queryClient.removeQueries({ queryKey: query.queryKey })
      throw notFound()
    }
  },
  component: DocumentPage,
  notFoundComponent: DocumentNotFound,
})

function DocumentPage() {
  const { workspace } = Route.useRouteContext()
  const { documentId } = Route.useParams()
  const router = useRouter()
  const hash = useLocation({ select: (location) => location.hash })
  const { data: document } = useSuspenseQuery(
    documentQuery(workspace.id, documentId)
  )
  const saveTitle = useSaveDocumentTitle(workspace.id, documentId)
  const syncTitle = useSyncDocumentTitle(workspace.id, documentId)
  const activities = useActivityBridge(workspace, {
    kind: "document",
    documentId,
  })
  if (!document) return <DocumentNotFound />

  const blockLink = (blockId: string) => {
    const { href } = router.buildLocation({
      to: "/$workspace/documents/$documentId",
      params: { workspace: workspace.slug, documentId },
      hash: `${BLOCK_HASH_PREFIX}${blockId}`,
    })
    return new URL(href, globalThis.document.baseURI).href
  }

  return (
    <Page.Layout>
      <Page.ScrollArea>
        <div className="mx-auto w-full max-w-3xl px-4 pt-8 md:px-16 md:pt-14">
          <DocumentEditor
            key={documentId}
            ydoc={document.content}
            focusBlockId={
              hash.startsWith(BLOCK_HASH_PREFIX)
                ? hash.slice(BLOCK_HASH_PREFIX.length)
                : undefined
            }
            blockLink={blockLink}
            onContentChange={saveTitle.mutate}
            onLoaded={syncTitle.mutate}
            activities={activities}
          />
        </div>
      </Page.ScrollArea>
    </Page.Layout>
  )
}

function DocumentNotFound() {
  return (
    <NotFound className="flex-1 py-20">
      <NotFound.Title>Document not found</NotFound.Title>
      <NotFound.Description>
        It may have been deleted, or it lives on another device.
      </NotFound.Description>
    </NotFound>
  )
}
