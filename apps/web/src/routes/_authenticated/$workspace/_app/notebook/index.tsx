import { createFileRoute } from "@tanstack/react-router"
import { NotebookPen } from "lucide-react"
import { ROOT_FOLDER_ID } from "@/local-db/db"
import { notebookTreeQuery } from "@/local-db/notebook-queries"
import { FolderPage } from "@/notebook/components/FolderPage"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/notebook/"
)({
  staticData: { crumb: { label: "Notebook", icon: NotebookPen } },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      notebookTreeQuery(context.workspace.id)
    ),
  component: NotebookPage,
})

function NotebookPage() {
  const { workspace } = Route.useRouteContext()
  return (
    <FolderPage
      workspace={{
        id: workspace.id,
        slug: workspace.slug,
        timezone: workspace.settings.timezone,
      }}
      folderId={ROOT_FOLDER_ID}
    />
  )
}
