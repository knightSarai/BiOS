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
  CopyPlus,
  CornerLeftUp,
  Hash,
  Link,
  Trash,
  Type,
} from "lucide-react"
import { toast } from "sonner"
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
import { useDuplicateActivity } from "@/local-db/activity-mutations"
import {
  activityQuery,
  activitySummaryQuery,
} from "@/local-db/activity-queries"
import {
  copyToClipboard,
  crumbMenuItemClassName as itemClassName,
} from "@layout/core/copy-to-clipboard"
import { PageCrumb } from "@layout/core/PageCrumb"
import {
  DeleteActivityDialog,
  deleteActivityDialogOpenAtom,
} from "./DeleteActivityDialog"
import { openParentDialogAtom } from "./ParentDialog"

const ROUTE_ID = "/_authenticated/$workspace/_app/activities/$activityId"

// Annotated because the route's own definition includes this crumb, and the typed
// parent link would otherwise make their types depend on each other.
function ActivityCrumb(): React.JSX.Element {
  const { activityId } = useParams({ from: ROUTE_ID })
  const { workspace } = useRouteContext({ from: ROUTE_ID })
  const router = useRouter()
  const openDelete = useSetAtom(deleteActivityDialogOpenAtom)
  const { data: found } = useQuery(activityQuery(workspace.id, activityId))
  const duplicate = useDuplicateActivity(workspace.id)
  const openParentDialog = useSetAtom(openParentDialogAtom)
  const parentId = found?.activity.parentId ?? null
  const { data: parent } = useQuery({
    ...activitySummaryQuery(workspace.id, parentId ?? ""),
    enabled: parentId !== null,
  })

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

  const duplicateActivity = () =>
    duplicate.mutate(activityId, {
      onSuccess: (copy) => {
        if (!copy) return
        toast.success(`Created ${copy.key} from ${key}`)
        void router.navigate({
          to: "/$workspace/activities/$activityId",
          params: { workspace: workspace.slug, activityId: copy.id },
        })
      },
      onError: () => toast.error(`Couldn't duplicate ${key}.`),
    })

  return (
    <>
      {parent ? (
        <>
          <RouterLink
            to="/$workspace/activities/$activityId"
            params={{ workspace: workspace.slug, activityId: parent.id }}
            title={parent.title}
            aria-label={`${parent.key} ${parent.title || "Untitled"}`}
            className="flex min-h-7 shrink-0 items-center rounded-md px-1.5 text-muted-foreground tabular-nums transition-colors hover:bg-accent hover:text-foreground max-md:min-h-11"
          >
            {parent.key}
          </RouterLink>
          <ChevronRight
            aria-hidden
            className="size-3 shrink-0 text-muted-foreground"
          />
        </>
      ) : null}
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
            <DropdownMenuItem
              className={itemClassName}
              disabled={duplicate.isPending}
              onClick={duplicateActivity}
            >
              <CopyPlus className="text-muted-foreground" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              className={itemClassName}
              onClick={() =>
                openParentDialog({
                  activityId,
                  activityKey: key,
                  hasParent: parentId !== null,
                })
              }
            >
              <CornerLeftUp className="text-muted-foreground" />
              {parentId ? "Change parent…" : "Set parent…"}
            </DropdownMenuItem>
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
