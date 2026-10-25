import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FileText, Plus } from "lucide-react"
import { EmptyState } from "@/components/common/EmptyState"
import { Button } from "@/components/ui/button"
import { useCreateDocument } from "@/local-db/document-mutations"
import { documentListQuery } from "@/local-db/document-queries"
import { Page } from "@layout/content/Page"
import { DocumentList } from "./-components/DocumentList"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/documents/"
)({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      documentListQuery(context.workspace.id)
    ),
  component: DocumentsPage,
})

function DocumentsPage() {
  const { workspace } = Route.useRouteContext()
  const navigate = Route.useNavigate()
  const { data: documents } = useSuspenseQuery(documentListQuery(workspace.id))
  const createDocument = useCreateDocument(workspace.id)

  const create = () =>
    createDocument.mutate(undefined, {
      onSuccess: (documentId) =>
        navigate({
          to: "/$workspace/documents/$documentId",
          params: { workspace: workspace.slug, documentId },
        }),
    })

  return (
    <Page.Layout>
      <Page.Header>
        <Page.HeaderContent>
          <Page.Title>Documents</Page.Title>
        </Page.HeaderContent>
        <Page.HeaderActions>
          <Button onClick={create} disabled={createDocument.isPending}>
            <Plus data-icon="inline-start" />
            New document
          </Button>
        </Page.HeaderActions>
      </Page.Header>
      <Page.Body>
        <Page.ScrollArea>
          <Page.Content>
            {documents.length === 0 ? (
              <EmptyState.Root>
                <EmptyState.Icon icon={FileText} />
                <EmptyState.Text>
                  <EmptyState.Title>No documents yet</EmptyState.Title>
                  <EmptyState.Description>
                    Write down an idea, a plan or notes. Everything stays on
                    this device.
                  </EmptyState.Description>
                </EmptyState.Text>
                <Button
                  variant="outline"
                  onClick={create}
                  disabled={createDocument.isPending}
                >
                  <Plus data-icon="inline-start" />
                  New document
                </Button>
              </EmptyState.Root>
            ) : (
              <DocumentList
                documents={documents}
                workspaceSlug={workspace.slug}
                timezone={workspace.settings.timezone}
              />
            )}
          </Page.Content>
        </Page.ScrollArea>
      </Page.Body>
    </Page.Layout>
  )
}
