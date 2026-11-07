import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useSetAtom } from "jotai"
import { CircleDashed, Plus } from "lucide-react"
import { openNewActivityAtom } from "@/activities/new-activity"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { EmptyState } from "@/components/common/EmptyState"
import { activityListQuery, areasQuery } from "@/local-db/activity-queries"
import { Page } from "@layout/content/Page"
import { ActivityList, ActivityListControls } from "./-components/ActivityList"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/activities/"
)({
  staticData: { crumb: { label: "Activities", icon: CircleDashed } },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(areasQuery(context.workspace)),
      context.queryClient.ensureQueryData(
        activityListQuery(context.workspace.id)
      ),
    ]),
  component: ActivitiesPage,
})

function ActivitiesPage() {
  const { workspace } = Route.useRouteContext()
  const { data: areas } = useSuspenseQuery(areasQuery(workspace))
  const { data: activities } = useSuspenseQuery(activityListQuery(workspace.id))
  const openNewActivity = useSetAtom(openNewActivityAtom)

  return (
    <Page.Layout>
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5 md:px-6">
        <h1 className="text-sm font-medium">Activities</h1>
        <ActivityListControls className="max-md:order-last max-md:basis-full" />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground max-md:hidden">
            Press <Kbd>C</Kbd>
          </span>
          <Button
            size="sm"
            className="max-md:h-11"
            onClick={() =>
              openNewActivity({
                areaId: null,
                goalId: null,
                typeId: null,
                parent: null,
              })
            }
          >
            <Plus data-icon="inline-start" />
            New activity
          </Button>
        </div>
      </header>
      <Page.Body>
        <Page.ScrollArea>
          <div className="px-2 py-3 md:px-4">
            {activities.length === 0 ? (
              <EmptyState.Root>
                <EmptyState.Icon icon={CircleDashed} />
                <EmptyState.Text>
                  <EmptyState.Title>No activities yet</EmptyState.Title>
                  <EmptyState.Description>
                    Select lines in a document and press Create activity.
                  </EmptyState.Description>
                </EmptyState.Text>
              </EmptyState.Root>
            ) : (
              <ActivityList
                activities={activities}
                areas={areas}
                workspaceId={workspace.id}
                workspaceSlug={workspace.slug}
                timezone={workspace.settings.timezone}
              />
            )}
          </div>
        </Page.ScrollArea>
      </Page.Body>
    </Page.Layout>
  )
}
