import { useQuery } from "@tanstack/react-query"
import { Link, useParams, useRouteContext } from "@tanstack/react-router"
import { ChevronRight, Folder } from "lucide-react"
import { folderQuery } from "@/local-db/notebook-queries"
import { PageCrumb } from "@layout/core/PageCrumb"

const ROUTE_ID = "/_authenticated/$workspace/_app/notebook/folders/$folderId"

function FolderCrumb() {
  const { folderId } = useParams({ from: ROUTE_ID })
  const { workspace } = useRouteContext({ from: ROUTE_ID })
  const { data } = useQuery(folderQuery(workspace.id, folderId))
  if (!data) return <PageCrumb>Folder</PageCrumb>
  const parents = data.path.slice(0, -1)

  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <Link
        to="/$workspace/notebook"
        params={{ workspace: workspace.slug }}
        className="flex min-h-7 items-center rounded-md px-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-md:hidden"
      >
        Notebook
      </Link>
      {parents.map((parent) => (
        <span
          key={parent.id}
          className="flex items-center gap-0.5 max-md:hidden"
        >
          <ChevronRight
            aria-hidden
            className="size-3 shrink-0 text-muted-foreground"
          />
          <Link
            to="/$workspace/notebook/folders/$folderId"
            params={{ workspace: workspace.slug, folderId: parent.id }}
            className="flex min-h-7 items-center rounded-md px-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {parent.name}
          </Link>
        </span>
      ))}
      <ChevronRight
        aria-hidden
        className="size-3 shrink-0 text-muted-foreground max-md:hidden"
      />
      <PageCrumb
        icon={<Folder className="size-[15px] shrink-0 text-accent-text" />}
      >
        {data.folder.name}
      </PageCrumb>
    </span>
  )
}

export { FolderCrumb }
