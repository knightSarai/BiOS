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
import { ActivityList } from "./-components/ActivityList"

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
      <Page.Header>
        <Page.HeaderContent>
          <Page.Title>Activities</Page.Title>
        </Page.HeaderContent>
        <Page.HeaderActions>
          <span className="text-xs text-muted-foreground max-md:hidden">
            Press <Kbd>C</Kbd>
          </span>
          <Button
            onClick={() => openNewActivity({ areaId: null, goalId: null })}
          >
            <Plus data-icon="inline-start" />
            New activity
          </Button>
        </Page.HeaderActions>
      </Page.Header>
      <Page.Body>
        <Page.ScrollArea>
          <Page.Content>
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
              />
            )}
          </Page.Content>
        </Page.ScrollArea>
      </Page.Body>
    </Page.Layout>
  )
}
