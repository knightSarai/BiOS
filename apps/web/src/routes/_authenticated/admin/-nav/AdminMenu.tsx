import { ArrowLeftRight } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { ShellMenu } from "@layout/core/ShellMenu"
import { shellMenuItemClassName } from "@layout/core/shell-menu-item"

function AdminMenu() {
  const navigate = useNavigate()

  return (
    <ShellMenu title="Admin">
      <DropdownMenuItem
        className={shellMenuItemClassName}
        onClick={() => navigate({ to: "/" })}
      >
        <ArrowLeftRight />
        Back to workspaces
      </DropdownMenuItem>
    </ShellMenu>
  )
}

export { AdminMenu }
