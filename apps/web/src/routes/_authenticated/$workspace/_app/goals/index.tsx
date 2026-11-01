import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus, Target } from "lucide-react"
import { EmptyState } from "@/components/common/EmptyState"
import { Button } from "@/components/ui/button"
import { GoalIcon } from "@/goals/components/GoalIcon"
import { GOAL_STATUSES, goalStatusLabels } from "@/goals/status"
import { formatTargetMonth } from "@/goals/target-month"
import { useCreateGoal } from "@/local-db/goal-mutations"
import { goalListQuery } from "@/local-db/goal-queries"
import { cn } from "@/lib/utils"
import { Page } from "@layout/content/Page"

export const Route = createFileRoute("/_authenticated/$workspace/_app/goals/")({
  staticData: { crumb: { label: "Goals", icon: Target } },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(goalListQuery(context.workspace.id)),
  component: GoalsPage,
})

function GoalsPage() {
  const { workspace } = Route.useRouteContext()
  const navigate = Route.useNavigate()
  const { data: goals } = useSuspenseQuery(goalListQuery(workspace.id))
  const createGoal = useCreateGoal(workspace.id)

  const create = async () => {
    const goalId = await createGoal.mutateAsync("")
    await navigate({
      to: "/$workspace/goals/$goalId",
      params: { workspace: workspace.slug, goalId },
    })
  }

  return (
    <Page.Layout>
      <Page.Header>
        <Page.HeaderContent>
          <Page.Title>Goals</Page.Title>
        </Page.HeaderContent>
        <Page.HeaderActions>
          <Button onClick={() => void create()} disabled={createGoal.isPending}>
            <Plus data-icon="inline-start" />
            New goal
          </Button>
        </Page.HeaderActions>
      </Page.Header>
      <Page.Body>
        <Page.ScrollArea>
          <Page.Content>
            {goals.length === 0 ? (
              <EmptyState.Root>
                <EmptyState.Icon icon={Target} />
                <EmptyState.Text>
                  <EmptyState.Title>No goals yet</EmptyState.Title>
                  <EmptyState.Description>
                    A goal gathers activities from any area, with its own
                    documents and a target month.
                  </EmptyState.Description>
                </EmptyState.Text>
              </EmptyState.Root>
            ) : (
              <div className="flex flex-col gap-6">
                {GOAL_STATUSES.map((status) => {
                  const rows = goals.filter((goal) => goal.status === status)
                  if (rows.length === 0) return null
                  return (
                    <section key={status} className="flex flex-col gap-2">
                      <h2 className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                        {goalStatusLabels[status]}
                      </h2>
                      <ul className="flex flex-col divide-y rounded-lg border">
                        {rows.map((goal) => (
                          <li key={goal.id}>
                            <Link
                              to="/$workspace/goals/$goalId"
                              params={{
                                workspace: workspace.slug,
                                goalId: goal.id,
                              }}
                              className="flex min-h-11 items-center gap-3 px-4 py-2 transition-colors hover:bg-accent"
                            >
                              <GoalIcon icon={goal.icon} />
                              <span
                                dir="auto"
                                className={cn(
                                  "min-w-0 flex-1 truncate",
                                  !goal.title && "text-muted-foreground",
                                  goal.status === "dropped" && "line-through"
                                )}
                              >
                                {goal.title || "Untitled goal"}
                              </span>
                              {goal.targetMonth ? (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {formatTargetMonth(goal.targetMonth)}
                                </span>
                              ) : null}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )
                })}
              </div>
            )}
          </Page.Content>
        </Page.ScrollArea>
      </Page.Body>
    </Page.Layout>
  )
}
