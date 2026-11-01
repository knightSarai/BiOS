import { createFileRoute, notFound } from "@tanstack/react-router"
import { NotFound } from "@/components/common/NotFound"
import { folderQuery, notebookTreeQuery } from "@/local-db/notebook-queries"
import { FolderPage } from "@/notebook/components/FolderPage"
import { FolderCrumb } from "../-components/FolderCrumb"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/notebook/folders/$folderId"
)({
  staticData: { crumb: { label: "Folder", Title: FolderCrumb } },
  loader: async ({ context, params }) => {
    const [found] = await Promise.all([
      context.queryClient.ensureQueryData(
        folderQuery(context.workspace.id, params.folderId)
      ),
      context.queryClient.ensureQueryData(
        notebookTreeQuery(context.workspace.id)
      ),
    ])
    if (!found) throw notFound()
  },
  component: NotebookFolderPage,
  notFoundComponent: FolderNotFound,
})

function NotebookFolderPage() {
  const { workspace } = Route.useRouteContext()
  const { folderId } = Route.useParams()
  return (
    <FolderPage
      key={folderId}
      workspace={{
        id: workspace.id,
        slug: workspace.slug,
        timezone: workspace.settings.timezone,
      }}
      folderId={folderId}
    />
  )
}

function FolderNotFound() {
  return (
    <NotFound className="flex-1 py-20">
      <NotFound.Title>Folder not found</NotFound.Title>
      <NotFound.Description>
        It may have been deleted, or it lives on another device.
      </NotFound.Description>
    </NotFound>
  )
}
