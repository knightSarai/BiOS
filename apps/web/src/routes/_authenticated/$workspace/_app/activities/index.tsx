import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { CircleDashed } from "lucide-react"
import { z } from "zod"
import { areaDotClassNames } from "@/activities/areas"
import { EmptyState } from "@/components/common/EmptyState"
import { activityListQuery, areasQuery } from "@/local-db/activity-queries"
import { cn } from "@/lib/utils"
import { Page } from "@layout/content/Page"
import { ActivityList } from "./-components/ActivityList"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/activities/"
)({
  staticData: { crumb: { label: "Activities", icon: CircleDashed } },
  validateSearch: z.object({ area: z.string().optional() }),
  loaderDeps: ({ search }) => ({ area: search.area }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(areasQuery(context.workspace)),
      context.queryClient.ensureQueryData(
        activityListQuery(context.workspace.id, deps.area)
      ),
    ]),
  component: ActivitiesPage,
})

const chipClassName =
  "flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-accent-text data-[status=active]:bg-selection data-[status=active]:text-foreground max-md:min-h-11"

function ActivitiesPage() {
  const { workspace } = Route.useRouteContext()
  const { area: areaId } = Route.useSearch()
  const { data: areas } = useSuspenseQuery(areasQuery(workspace))
  const { data: activities } = useSuspenseQuery(
    activityListQuery(workspace.id, areaId)
  )
  const currentArea = areas.find((area) => area.id === areaId)

  return (
    <Page.Layout>
      <Page.Header>
        <Page.HeaderContent>
          <Page.Title>
            {currentArea ? currentArea.name : "Activities"}
          </Page.Title>
        </Page.HeaderContent>
      </Page.Header>
      <Page.Body>
        <Page.ScrollArea>
          <Page.Content>
            <nav aria-label="Filter by area" className="flex flex-wrap gap-1.5">
              <Link
                to="/$workspace/activities"
                params={{ workspace: workspace.slug }}
                search={{}}
                activeOptions={{ exact: true, includeSearch: true }}
                className={chipClassName}
              >
                All
              </Link>
              {areas.map((area) => (
                <Link
                  key={area.id}
                  to="/$workspace/activities"
                  params={{ workspace: workspace.slug }}
                  search={{ area: area.id }}
                  activeOptions={{ includeSearch: true }}
                  className={chipClassName}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      areaDotClassNames[area.color]
                    )}
                  />
                  {area.name}
                </Link>
              ))}
            </nav>
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
