import { Check, Settings } from "lucide-react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { useTRPC } from "@/trpc/react"
import { ShellMenu } from "@layout/core/ShellMenu"
import { shellMenuItemClassName } from "@layout/core/shell-menu-item"

const workspaceRoute = getRouteApi("/_authenticated/$workspace")

function WorkspaceMenu() {
  const { workspace } = workspaceRoute.useRouteContext()
  const navigate = useNavigate()
  const trpc = useTRPC()
  const { data: workspaces } = useSuspenseQuery(
    trpc.workspaces.list.queryOptions()
  )
  const params = { workspace: workspace.slug }

  return (
    <ShellMenu title={workspace.name}>
      <DropdownMenuItem
        className={shellMenuItemClassName}
        onClick={() => navigate({ to: "/$workspace/settings", params })}
      >
        <Settings />
        Settings
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className={shellMenuItemClassName}>
          Switch workspace
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56">
          {workspaces.map((entry) => (
            <DropdownMenuItem
              key={entry.id}
              className={shellMenuItemClassName}
              onClick={() =>
                navigate({
                  to: "/$workspace",
                  params: { workspace: entry.slug },
                })
              }
            >
              <span className="flex size-[18px] shrink-0 items-center justify-center rounded bg-primary text-[10px] font-semibold text-primary-foreground">
                {entry.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 truncate">{entry.name}</span>
              {entry.id === workspace.id ? <Check /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </ShellMenu>
  )
}

export { WorkspaceMenu }
