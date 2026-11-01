import { useQuery } from "@tanstack/react-query"
import {
  Link as RouterLink,
  useParams,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router"
import { useSetAtom } from "jotai"
import {
  ChevronRight,
  Copy,
  FolderInput,
  Link,
  SmilePlus,
  Trash2,
  Type,
} from "lucide-react"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { documentDetailsQuery } from "@/local-db/notebook-queries"
import {
  deletingAtom,
  iconPickerAtom,
  movingAtom,
} from "@/notebook/components/atoms"
import { DocumentIcon } from "@/notebook/components/ItemIcon"
import { hasCustomIcon } from "@/notebook/stored-icon"
import {
  copyToClipboard,
  crumbMenuItemClassName as itemClassName,
} from "@layout/core/copy-to-clipboard"
import { PageCrumb } from "@layout/core/PageCrumb"

const ROUTE_ID = "/_authenticated/$workspace/_app/documents/$documentId"

const parentLinkClassName =
  "flex min-h-7 items-center rounded-md px-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"

function DocumentCrumb() {
  const { documentId } = useParams({ from: ROUTE_ID })
  const { workspace } = useRouteContext({ from: ROUTE_ID })
  const router = useRouter()
  const setMoving = useSetAtom(movingAtom)
  const setDeleting = useSetAtom(deletingAtom)
  const setIconPicker = useSetAtom(iconPickerAtom)
  const { data } = useQuery(documentDetailsQuery(workspace.id, documentId))
  if (!data) return <PageCrumb>Document</PageCrumb>
  const { document, folderPath } = data
  const title = document.title || "Untitled"
  const crumbAnchor = () =>
    globalThis.document.querySelector("[data-document-crumb]")

  const link = () => {
    const { href } = router.buildLocation({
      to: "/$workspace/documents/$documentId",
      params: { workspace: workspace.slug, documentId },
    })
    return new URL(href, globalThis.document.baseURI).href
  }

  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <RouterLink
        to="/$workspace/notebook"
        params={{ workspace: workspace.slug }}
        className={`${parentLinkClassName} max-md:hidden`}
      >
        Notebook
      </RouterLink>
      {folderPath.map((folder) => (
        <span
          key={folder.id}
          className="flex items-center gap-0.5 max-md:hidden"
        >
          <ChevronRight
            aria-hidden
            className="size-3 shrink-0 text-muted-foreground"
          />
          <RouterLink
            to="/$workspace/notebook/folders/$folderId"
            params={{ workspace: workspace.slug, folderId: folder.id }}
            className={parentLinkClassName}
          >
            {folder.name}
          </RouterLink>
        </span>
      ))}
      <ChevronRight
        aria-hidden
        className="size-3 shrink-0 text-muted-foreground max-md:hidden"
      />
      <span data-document-crumb className="flex min-w-0">
        <PageCrumb
          icon={
            <DocumentIcon
              icon={document.icon}
              className={
                hasCustomIcon(document.icon)
                  ? undefined
                  : "size-[15px] text-accent-text"
              }
            />
          }
          actionsLabel="Document actions"
          actions={
            <DropdownMenuGroup>
              <DropdownMenuItem
                className={itemClassName}
                onClick={() =>
                  setMoving({
                    kind: "document",
                    id: documentId,
                    title,
                    anchor: crumbAnchor(),
                  })
                }
              >
                <FolderInput className="text-muted-foreground" />
                Move to
              </DropdownMenuItem>
              <DropdownMenuItem
                className={itemClassName}
                onClick={() =>
                  setIconPicker({
                    target: { kind: "document", id: documentId },
                    anchor: crumbAnchor(),
                  })
                }
              >
                <SmilePlus className="text-muted-foreground" />
                Change icon
              </DropdownMenuItem>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className={itemClassName}
                onClick={() =>
                  setDeleting({
                    kind: "document",
                    id: documentId,
                    title,
                    anchor: null,
                  })
                }
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          }
        >
          <span dir="auto" className="truncate">
            {title}
          </span>
        </PageCrumb>
      </span>
    </span>
  )
}

export { DocumentCrumb }
