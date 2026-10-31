import { useQuery } from "@tanstack/react-query"
import { useParams, useRouteContext, useRouter } from "@tanstack/react-router"
import { useSetAtom } from "jotai"
import { Copy, Hash, Link, Trash, Type } from "lucide-react"
import { activityKey } from "@/activities/areas"
import { StatusIcon } from "@/activities/components/StatusIcon"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { activityQuery } from "@/local-db/activity-queries"
import {
  copyToClipboard,
  crumbMenuItemClassName as itemClassName,
} from "@layout/core/copy-to-clipboard"
import { PageCrumb } from "@layout/core/PageCrumb"
import {
  DeleteActivityDialog,
  deleteActivityDialogOpenAtom,
} from "./DeleteActivityDialog"

const ROUTE_ID = "/_authenticated/$workspace/_app/activities/$activityId"

function ActivityCrumb() {
  const { activityId } = useParams({ from: ROUTE_ID })
  const { workspace } = useRouteContext({ from: ROUTE_ID })
  const router = useRouter()
  const openDelete = useSetAtom(deleteActivityDialogOpenAtom)
  const { data: found } = useQuery(activityQuery(workspace.id, activityId))

  if (!found) return <PageCrumb>Activity</PageCrumb>
  const { activity, area } = found
  const key = activityKey(area?.key ?? "?", activity.number)
  const title = activity.title || "Untitled"

  const link = () => {
    const { href } = router.buildLocation({
      to: "/$workspace/activities/$activityId",
      params: { workspace: workspace.slug, activityId },
    })
    return new URL(href, document.baseURI).href
  }

  return (
    <>
      <PageCrumb
        icon={<StatusIcon status={activity.status} />}
        actionsLabel={`Actions for ${key}`}
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
                  onClick={() => copyToClipboard(key, "ID")}
                >
                  <Hash className="text-muted-foreground" />
                  Copy ID
                </DropdownMenuItem>
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
              className={itemClassName}
              variant="destructive"
              onClick={() => openDelete(activityId)}
            >
              <Trash />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        }
      >
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {key}
        </span>
        <span dir="auto" className="truncate">
          {title}
        </span>
      </PageCrumb>
      <DeleteActivityDialog
        activityId={activityId}
        activityKey={key}
        workspace={{ id: workspace.id, slug: workspace.slug }}
      />
    </>
  )
}

export { ActivityCrumb }
