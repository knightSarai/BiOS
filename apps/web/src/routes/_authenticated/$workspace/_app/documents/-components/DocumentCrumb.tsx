import { useQuery } from "@tanstack/react-query"
import { useParams, useRouteContext, useRouter } from "@tanstack/react-router"
import { Copy, FileText, Link, Type } from "lucide-react"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { documentQuery } from "@/local-db/document-queries"
import {
  copyToClipboard,
  crumbMenuItemClassName as itemClassName,
} from "@layout/core/copy-to-clipboard"
import { PageCrumb } from "@layout/core/PageCrumb"

const ROUTE_ID = "/_authenticated/$workspace/_app/documents/$documentId"

function DocumentCrumb() {
  const { documentId } = useParams({ from: ROUTE_ID })
  const { workspace } = useRouteContext({ from: ROUTE_ID })
  const router = useRouter()
  const { data: document } = useQuery(documentQuery(workspace.id, documentId))
  if (!document) return <PageCrumb>Document</PageCrumb>
  const title = document.title || "Untitled"

  const link = () => {
    const { href } = router.buildLocation({
      to: "/$workspace/documents/$documentId",
      params: { workspace: workspace.slug, documentId },
    })
    return new URL(href, globalThis.document.baseURI).href
  }

  return (
    <PageCrumb
      icon={<FileText className="size-[15px] shrink-0 text-accent-text" />}
      actionsLabel="Document actions"
      actions={
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={itemClassName}>
              <Copy className="text-muted-foreground" />
              Copy
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <DropdownMenuItem
                className={itemClassName}
                onClick={() => copyToClipboard(link(), "Link")}
              >
                <Link className="text-muted-foreground" />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem
                className={itemClassName}
                onClick={() => copyToClipboard(title, "Title")}
              >
                <Type className="text-muted-foreground" />
                Copy title
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      }
    >
      <span dir="auto" className="truncate">
        {title}
      </span>
    </PageCrumb>
  )
}

export { DocumentCrumb }
