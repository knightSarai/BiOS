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
  useSaveActivityTitle,
  useSyncActivityTitle,
} from "@/local-db/activity-mutations"
import {
  activitiesRepository,
  activityQuery,
  areasQuery,
} from "@/local-db/activity-queries"
import { Page } from "@layout/content/Page"
import {
  ActivityOriginLink,
  ActivityProperties,
  ActivityPropertyChips,
} from "./-components/ActivityProperties"
import { ActivityCrumb } from "./-components/ActivityCrumb"

const BLOCK_HASH_PREFIX = "block-"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/activities/$activityId"
)({
  staticData: { crumb: { label: "Activity", Title: ActivityCrumb } },
  loader: async ({ context, params }) => {
    const query = activityQuery(context.workspace.id, params.activityId)
    const [found] = await Promise.all([
      context.queryClient.ensureQueryData(query),
      context.queryClient.ensureQueryData(areasQuery(context.workspace)),
    ])
    if (!found) {
      context.queryClient.removeQueries({ queryKey: query.queryKey })
      throw notFound()
    }
    await activitiesRepository(context.workspace.id).ensureContent(
      params.activityId
    )
  },
  component: ActivityPage,
  notFoundComponent: ActivityNotFound,
})

function ActivityPage() {
  const { workspace } = Route.useRouteContext()
  const { activityId } = Route.useParams()
  const router = useRouter()
  const hash = useLocation({ select: (location) => location.hash })
  const { data: found } = useSuspenseQuery(
    activityQuery(workspace.id, activityId)
  )
  const saveTitle = useSaveActivityTitle(workspace.id, activityId)
  const syncTitle = useSyncActivityTitle(workspace.id, activityId)
  const activities = useActivityBridge(workspace, {
    kind: "activity",
    activityId,
  })
  if (!found) return <ActivityNotFound />
  const { activity } = found
  const propertiesWorkspace = {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    timezone: workspace.settings.timezone,
  }

  const blockLink = (blockId: string) => {
    const { href } = router.buildLocation({
      to: "/$workspace/activities/$activityId",
      params: { workspace: workspace.slug, activityId },
      hash: `${BLOCK_HASH_PREFIX}${blockId}`,
    })
    return new URL(href, document.baseURI).href
  }

  return (
    <Page.Layout>
      <Page.ScrollArea>
        <div className="mx-auto flex w-full max-w-5xl gap-10 px-4 pt-8 md:px-16 md:pt-14">
          <div className="min-w-0 flex-1">
            <div className="lg:hidden">
              <ActivityOriginLink
                activity={activity}
                workspace={propertiesWorkspace}
              />
            </div>
            <DocumentEditor
              key={activityId}
              ydoc={activity.content}
              focusBlockId={
                hash.startsWith(BLOCK_HASH_PREFIX)
                  ? hash.slice(BLOCK_HASH_PREFIX.length)
                  : undefined
              }
              blockLink={blockLink}
              onContentChange={saveTitle.mutate}
              onLoaded={syncTitle.mutate}
              activities={activities}
              titleAccessory={
                <div className="lg:hidden">
                  <ActivityPropertyChips
                    activity={activity}
                    workspace={propertiesWorkspace}
                  />
                </div>
              }
            />
          </div>
          <aside
            aria-label="Activity properties"
            className="w-64 shrink-0 max-lg:hidden lg:sticky lg:top-14 lg:self-start"
          >
            <ActivityProperties
              activity={activity}
              workspace={propertiesWorkspace}
            />
          </aside>
        </div>
      </Page.ScrollArea>
    </Page.Layout>
  )
}

function ActivityNotFound() {
  return (
    <NotFound className="flex-1 py-20">
      <NotFound.Title>Activity not found</NotFound.Title>
      <NotFound.Description>
        It may have been deleted, or it lives on another device.
      </NotFound.Description>
    </NotFound>
  )
}
