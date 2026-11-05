import { Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { statusName, type StatusNames } from "../activity-types"
import { ACTIVITY_STATUSES, type ActivityStatus } from "../status"
import { StatusIcon } from "./StatusIcon"

type StatusMenuProps = {
  status: ActivityStatus
  names?: StatusNames | null
  trigger: React.ReactElement
  onChange: (status: ActivityStatus) => void
}

function StatusMenu({
  status,
  names = null,
  trigger,
  onChange,
}: StatusMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          {ACTIVITY_STATUSES.map((option) => (
            <DropdownMenuItem
              key={option}
              className="min-h-8 max-md:min-h-11"
              onClick={() => {
                if (option !== status) onChange(option)
              }}
            >
              <StatusIcon status={option} />
              <span className="flex-1">{statusName(option, names)}</span>
              {option === status ? (
                <Check className="text-accent-text" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { StatusMenu }
