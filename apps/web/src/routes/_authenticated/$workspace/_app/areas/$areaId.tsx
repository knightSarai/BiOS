import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { useSetAtom } from "jotai"
import { CircleDashed, Plus } from "lucide-react"
import { openNewActivityAtom } from "@/activities/new-activity"
import { EmptyState } from "@/components/common/EmptyState"
import { NotFound } from "@/components/common/NotFound"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { activityListQuery, areasQuery } from "@/local-db/activity-queries"
import { entityDocumentsQuery } from "@/local-db/notebook-queries"
import { Page } from "@layout/content/Page"
import {
  ActivityList,
  ActivityListControls,
} from "../activities/-components/ActivityList"
import { AreaCrumb } from "./-components/AreaCrumb"
import { AreaDocuments } from "./-components/AreaDocuments"

type AreaSearch = { tab?: "documents" }

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/areas/$areaId"
)({
  ssr: false,
  staticData: { crumb: { label: "Area", Title: AreaCrumb } },
  validateSearch: (search: Record<string, unknown>): AreaSearch =>
    search.tab === "documents" ? { tab: "documents" } : {},
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

const tabTriggerClassName =
  "flex-none gap-1.5 px-0 text-sm max-md:h-11 [&>span]:font-normal [&>span]:text-muted-foreground [&>span]:tabular-nums"

function AreaPage() {
  const { workspace } = Route.useRouteContext()
  const { areaId } = Route.useParams()
  const { tab = "activities" } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: areas } = useSuspenseQuery(areasQuery(workspace))
  // The whole workspace, so a sub-activity filed in another area still counts.
  const { data: activities } = useSuspenseQuery(activityListQuery(workspace.id))
  const { data: documents } = useQuery(
    entityDocumentsQuery(workspace.id, { kind: "area", id: areaId })
  )
  const openNewActivity = useSetAtom(openNewActivityAtom)
  const area = areas.find((candidate) => candidate.id === areaId)
  if (!area) return <AreaNotFound />
  const documentCount =
    (documents?.inFolder.length ?? 0) + (documents?.attached.length ?? 0)
  const timezone = workspace.settings.timezone
  const newActivity = () =>
    openNewActivity({ areaId, goalId: null, typeId: null, parent: null })

  return (
    <Page.Layout>
      <Tabs
        value={tab}
        onValueChange={(next) =>
          void navigate({
            search: next === "documents" ? { tab: "documents" } : {},
            replace: true,
          })
        }
        className="contents"
      >
        <div className="flex shrink-0 items-center gap-3 border-b px-4 pt-4 md:px-8">
          <TabsList variant="line" className="flex-1 justify-start gap-5 p-0">
            <TabsTrigger value="activities" className={tabTriggerClassName}>
              Activities <span>{area.openCount}</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className={tabTriggerClassName}>
              Documents <span>{documents ? documentCount : ""}</span>
            </TabsTrigger>
          </TabsList>
          <Button onClick={newActivity} className="mb-1.5 max-md:hidden">
            <Plus data-icon="inline-start" />
            New activity
          </Button>
        </div>
        <Page.Body>
          <Page.ScrollArea>
            <Page.Content>
              <TabsContent value="activities" className="pt-3 text-sm">
                {activities.every((activity) => activity.areaId !== areaId) ? (
                  <EmptyState.Root>
                    <EmptyState.Icon icon={CircleDashed} />
                    <EmptyState.Text>
                      <EmptyState.Title>No activities yet</EmptyState.Title>
                    </EmptyState.Text>
                  </EmptyState.Root>
                ) : (
                  <div className="flex flex-col gap-3">
                    <ActivityListControls />
                    <ActivityList
                      activities={activities}
                      areaId={areaId}
                      showGenerated={false}
                      areas={areas}
                      workspaceId={workspace.id}
                      workspaceSlug={workspace.slug}
                      timezone={timezone}
                    />
                  </div>
                )}
              </TabsContent>
              <TabsContent value="documents" className="pt-3 text-sm">
                <AreaDocuments
                  areaId={areaId}
                  activities={activities}
                  workspace={{
                    id: workspace.id,
                    slug: workspace.slug,
                    timezone,
                  }}
                />
              </TabsContent>
            </Page.Content>
          </Page.ScrollArea>
        </Page.Body>
      </Tabs>
      <div className="order-last flex shrink-0 border-t px-4 py-2 md:hidden">
        <Button onClick={newActivity} className="h-11 flex-1">
          <Plus data-icon="inline-start" />
          New activity
        </Button>
      </div>
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
