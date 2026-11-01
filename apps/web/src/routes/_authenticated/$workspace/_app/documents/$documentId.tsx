import { createFileRoute, notFound } from "@tanstack/react-router"
import { NotFound } from "@/components/common/NotFound"
import { documentQuery } from "@/local-db/document-queries"
import { notebookTreeQuery } from "@/local-db/notebook-queries"
import { DocumentView } from "@/notebook/components/DocumentView"
import { DocumentCrumb } from "./-components/DocumentCrumb"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/documents/$documentId"
)({
  staticData: { crumb: { label: "Document", Title: DocumentCrumb } },
  loader: async ({ context, params }) => {
    const query = documentQuery(context.workspace.id, params.documentId)
    const [document] = await Promise.all([
      context.queryClient.ensureQueryData(query),
      context.queryClient.ensureQueryData(
        notebookTreeQuery(context.workspace.id)
      ),
    ])
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
  return (
    <DocumentView
      workspace={{
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        timezone: workspace.settings.timezone,
      }}
      documentId={documentId}
    />
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
