import { ChevronDown, LogOut } from "lucide-react"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { authClient } from "@knight-os/auth/client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { shellMenuItemClassName } from "./shell-menu-item"

type ShellMenuProps = {
  title: string
  children?: React.ReactNode
}

function ShellMenu({ title, children }: ShellMenuProps) {
  const navigate = useNavigate()

  const signOut = useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: () => navigate({ to: "/sign-in", reloadDocument: true }),
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="mb-2.5 flex min-h-9 max-w-full items-center gap-[9px] self-start rounded-md px-2 text-left transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-sidebar-accent"
          />
        }
      >
        <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
          {title.charAt(0).toUpperCase()}
        </span>
        <span className="truncate text-sm font-semibold text-foreground">
          {title}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {children}
        {children ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          className={shellMenuItemClassName}
          onClick={() => signOut.mutate()}
        >
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { ShellMenu }
