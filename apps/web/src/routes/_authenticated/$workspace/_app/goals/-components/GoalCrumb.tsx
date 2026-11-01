import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams, useRouteContext } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { GoalIcon } from "@/goals/components/GoalIcon"
import { useDeleteGoal, useRestoreGoal } from "@/local-db/goal-mutations"
import { goalQuery } from "@/local-db/goal-queries"
import { crumbMenuItemClassName as itemClassName } from "@layout/core/copy-to-clipboard"
import { PageCrumb } from "@layout/core/PageCrumb"

const ROUTE_ID = "/_authenticated/$workspace/_app/goals/$goalId"

function GoalCrumb() {
  const { goalId } = useParams({ from: ROUTE_ID })
  const { workspace } = useRouteContext({ from: ROUTE_ID })
  const navigate = useNavigate()
  const { data: goal } = useQuery(goalQuery(workspace.id, goalId))
  const remove = useDeleteGoal(workspace.id, goalId)
  const restore = useRestoreGoal(workspace.id)
  if (!goal) return <PageCrumb>Goal</PageCrumb>
  const title = goal.title || "Untitled goal"

  const deleteGoal = async () => {
    await navigate({
      to: "/$workspace/goals",
      params: { workspace: workspace.slug },
    })
    const snapshot = await remove.mutateAsync()
    if (!snapshot) return
    toast.success(`Deleted ${title}`, {
      description: "Its activities and its folder stay.",
      action: { label: "Undo", onClick: () => restore.mutate(snapshot) },
    })
  }

  return (
    <PageCrumb
      icon={<GoalIcon icon={goal.icon} className="size-[15px]" />}
      actionsLabel="Goal actions"
      actions={
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            className={itemClassName}
            onClick={() => void deleteGoal()}
          >
            <Trash2 />
            Delete goal
          </DropdownMenuItem>
        </DropdownMenuGroup>
      }
    >
      <span dir="auto" className="truncate">
        {title}
      </span>
    </PageCrumb>
  )
}

export { GoalCrumb }
