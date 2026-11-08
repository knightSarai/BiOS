import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { useSetAtom } from "jotai"
import { CircleDashed, Plus } from "lucide-react"
import { ColorDot } from "@/activities/components/ColorDot"
import { openNewActivityAtom } from "@/activities/new-activity"
import { EmptyState } from "@/components/common/EmptyState"
import { NotFound } from "@/components/common/NotFound"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { activityListQuery, areasQuery } from "@/local-db/activity-queries"
import { EntityDocuments } from "@/notebook/components/EntityDocuments"
import { Page } from "@layout/content/Page"
import {
  ActivityList,
  ActivityListControls,
} from "../activities/-components/ActivityList"
import { AreaCrumb } from "./-components/AreaCrumb"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/areas/$areaId"
)({
  ssr: false,
  staticData: { crumb: { label: "Area", Title: AreaCrumb } },
  loader: async ({ context, params }) => {
    const [areas] = await Promise.all([
      context.queryClient.ensureQueryData(areasQuery(context.workspace)),
      context.queryClient.ensureQueryData(
        activityListQuery(context.workspace.id)
      ),
    ])
    if (!areas.some((area) => area.id === params.areaId)) throw notFound()
  },
  component: AreaPage,
  notFoundComponent: AreaNotFound,
})

function AreaPage() {
  const { workspace } = Route.useRouteContext()
  const { areaId } = Route.useParams()
  const { data: areas } = useSuspenseQuery(areasQuery(workspace))
  // The whole workspace, so a sub-activity filed in another area still counts.
  const { data: activities } = useSuspenseQuery(activityListQuery(workspace.id))
  const openNewActivity = useSetAtom(openNewActivityAtom)
  const area = areas.find((candidate) => candidate.id === areaId)
  if (!area) return <AreaNotFound />

  return (
    <Page.Layout>
      <Page.Header>
        <Page.HeaderContent>
          <Page.Title>
            <span className="flex items-center gap-2.5">
              <ColorDot color={area.color} className="size-2.5 shrink-0" />
              <span dir="auto">{area.name}</span>
            </span>
          </Page.Title>
        </Page.HeaderContent>
        <Page.HeaderActions>
          <span className="text-xs text-muted-foreground max-md:hidden">
            Press <Kbd>C</Kbd>
          </span>
          <Button
            onClick={() =>
              openNewActivity({
                areaId,
                goalId: null,
                typeId: null,
                parent: null,
              })
            }
          >
            <Plus data-icon="inline-start" />
            New activity
          </Button>
        </Page.HeaderActions>
      </Page.Header>
      <Page.Body>
        <Page.ScrollArea>
          <Page.Content>
            <EntityDocuments
              owner={{ kind: "area", id: areaId }}
              workspace={{
                id: workspace.id,
                slug: workspace.slug,
                timezone: workspace.settings.timezone,
              }}
              className="rounded-lg border p-4"
            />
            {activities.every((activity) => activity.areaId !== areaId) ? (
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
              <section aria-label="Activities" className="flex flex-col gap-3">
                <ActivityListControls />
                <ActivityList
                  activities={activities}
                  areaId={areaId}
                  areas={areas}
                  workspaceId={workspace.id}
                  workspaceSlug={workspace.slug}
                  timezone={workspace.settings.timezone}
                />
              </section>
            )}
          </Page.Content>
        </Page.ScrollArea>
      </Page.Body>
    </Page.Layout>
  )
}

function AreaNotFound() {
  return (
    <NotFound className="flex-1 py-20">
      <NotFound.Title>Area not found</NotFound.Title>
      <NotFound.Description>
        It may have been deleted, or it lives on another device.
      </NotFound.Description>
    </NotFound>
  )
}
