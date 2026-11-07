import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import {
  createFileRoute,
  Link,
  notFound,
  useLocation,
  useRouter,
} from "@tanstack/react-router"
import { ColorDot } from "@/activities/components/ColorDot"
import { StatusIcon } from "@/activities/components/StatusIcon"
import { useActivityBridge } from "@/activities/use-activity-bridge"
import { NotFound } from "@/components/common/NotFound"
import { DocumentEditor } from "@/editor/components/DocumentEditor"
import { useSaveGoalContent, useSyncGoalTitle } from "@/local-db/goal-mutations"
import {
  goalActivitiesQuery,
  goalQuery,
  goalsRepository,
} from "@/local-db/goal-queries"
import { EntityDocuments } from "@/notebook/components/EntityDocuments"
import { PageIconButton } from "@/notebook/components/PageIconButton"
import { useMentionBridge } from "@/notebook/components/use-mention-bridge"
import { Page } from "@layout/content/Page"
import { GoalCrumb } from "./-components/GoalCrumb"
import { GoalProperties } from "./-components/GoalProperties"

const BLOCK_HASH_PREFIX = "block-"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/goals/$goalId"
)({
  staticData: { crumb: { label: "Goal", Title: GoalCrumb } },
  loader: async ({ context, params }) => {
    const query = goalQuery(context.workspace.id, params.goalId)
    const goal = await context.queryClient.ensureQueryData(query)
    if (!goal) {
      context.queryClient.removeQueries({ queryKey: query.queryKey })
      throw notFound()
    }
    await goalsRepository(context.workspace.id).ensureContent(params.goalId)
  },
  component: GoalPage,
  notFoundComponent: GoalNotFound,
})

function GoalPage() {
  const { workspace } = Route.useRouteContext()
  const { goalId } = Route.useParams()
  const router = useRouter()
  const hash = useLocation({ select: (location) => location.hash })
  const { data: goal } = useSuspenseQuery(goalQuery(workspace.id, goalId))
  const { data: groups } = useQuery(goalActivitiesQuery(workspace.id, goalId))
  const saveContent = useSaveGoalContent(workspace.id, goalId)
  const syncTitle = useSyncGoalTitle(workspace.id, goalId)
  const activities = useActivityBridge(workspace, { kind: "goal", goalId })
  const mentions = useMentionBridge({
    id: workspace.id,
    slug: workspace.slug,
    timezone: workspace.settings.timezone,
  })
  if (!goal) return <GoalNotFound />
  const pageWorkspace = {
    id: workspace.id,
    slug: workspace.slug,
    timezone: workspace.settings.timezone,
  }

  const blockLink = (blockId: string) => {
    const { href } = router.buildLocation({
      to: "/$workspace/goals/$goalId",
      params: { workspace: workspace.slug, goalId },
      hash: `${BLOCK_HASH_PREFIX}${blockId}`,
    })
    return new URL(href, document.baseURI).href
  }

  return (
    <Page.Layout>
      <Page.ScrollArea>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-8 pb-16 md:px-16 md:pt-14">
          <div className="group/page">
            <PageIconButton
              target={{ kind: "goal", id: goalId }}
              icon={goal.icon}
            />
            <DocumentEditor
              key={goalId}
              ydoc={goal.content}
              focusBlockId={
                hash.startsWith(BLOCK_HASH_PREFIX)
                  ? hash.slice(BLOCK_HASH_PREFIX.length)
                  : undefined
              }
              blockLink={blockLink}
              onContentChange={saveContent.mutate}
              onLoaded={syncTitle.mutate}
              activities={activities}
              mentions={mentions}
              titleAccessory={
                <div className="flex flex-col gap-6 pb-4">
                  <GoalProperties
                    goal={goal}
                    groups={groups ?? []}
                    workspaceId={workspace.id}
                    timezone={workspace.settings.timezone}
                  />
                  <EntityDocuments
                    owner={{ kind: "goal", id: goalId }}
                    workspace={pageWorkspace}
                  />
                </div>
              }
            />
          </div>
          <section
            aria-labelledby="goal-activities"
            className="flex flex-col gap-2"
          >
            <h2 id="goal-activities" className="text-sm font-semibold">
              Activities
            </h2>
            {groups && groups.length > 0 ? (
              groups.map((group) => (
                <div key={group.area.id} className="flex flex-col">
                  <div className="flex min-h-8 items-center gap-2 rounded-md bg-muted px-2.5 text-xs text-muted-foreground">
                    <ColorDot color={group.area.color} className="size-2" />
                    <span className="font-medium text-foreground">
                      {group.area.name}
                    </span>
                    <span>{group.activities.length}</span>
                  </div>
                  <ul className="flex flex-col divide-y">
                    {group.activities.map((activity) => (
                      <li key={activity.id}>
                        <Link
                          to="/$workspace/activities/$activityId"
                          params={{
                            workspace: workspace.slug,
                            activityId: activity.id,
                          }}
                          className="flex min-h-10 items-center gap-2.5 px-2.5 text-sm hover:bg-accent max-md:min-h-11"
                        >
                          <StatusIcon status={activity.status} />
                          <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                            {activity.key}
                          </span>
                          <span dir="auto" className="min-w-0 flex-1 truncate">
                            {activity.title || "Untitled"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                No activities yet. Set this goal on an activity, or write a
                checklist line here and press Mod Shift O.
              </p>
            )}
          </section>
        </div>
      </Page.ScrollArea>
    </Page.Layout>
  )
}

function GoalNotFound() {
  return (
    <NotFound className="flex-1 py-20">
      <NotFound.Title>Goal not found</NotFound.Title>
      <NotFound.Description>
        It may have been deleted, or it lives on another device.
      </NotFound.Description>
    </NotFound>
  )
}
