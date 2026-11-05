import { Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { GoalIcon } from "@/goals/components/GoalIcon"
import type { GoalStatus } from "@/goals/status"

type GoalOption = {
  id: string
  title: string
  icon: string | null
  status: GoalStatus
}

type GoalMenuProps = {
  goals: GoalOption[]
  value: string | null
  trigger: React.ReactElement
  onChange: (goalId: string | null) => void
}

function GoalMenu({ goals, value, trigger, onChange }: GoalMenuProps) {
  const choices = goals.filter(
    (goal) => goal.status === "in-progress" || goal.id === value
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Goal</DropdownMenuLabel>
          {choices.map((option) => (
            <DropdownMenuItem
              key={option.id}
              className="min-h-8 max-md:min-h-11"
              onClick={() => {
                if (option.id !== value) onChange(option.id)
              }}
            >
              <GoalIcon icon={option.icon} className="size-3.5" />
              <span className="flex-1 truncate">
                {option.title || "Untitled goal"}
              </span>
              {option.id === value ? (
                <Check className="text-accent-text" />
              ) : null}
            </DropdownMenuItem>
          ))}
          {choices.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No goals in progress.
            </p>
          ) : null}
          {value ? (
            <DropdownMenuItem
              className="min-h-8 max-md:min-h-11"
              onClick={() => onChange(null)}
            >
              <span className="flex-1 text-muted-foreground">
                Remove from goal
              </span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { GoalMenu }
export type { GoalOption }
