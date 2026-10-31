import { Ellipsis } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type PageCrumbProps = {
  icon?: React.ReactNode
  children: React.ReactNode
  actions?: React.ReactNode
  actionsLabel?: string
}

function PageCrumb({
  icon,
  children,
  actions,
  actionsLabel = "More actions",
}: PageCrumbProps) {
  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <span
        aria-current="page"
        className="flex min-h-7 min-w-0 items-center gap-[7px] rounded-md px-1.5 whitespace-nowrap text-foreground max-md:min-h-11"
      >
        {icon}
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {children}
        </span>
      </span>
      {actions ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={actionsLabel}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground max-md:size-11"
              />
            }
          >
            <Ellipsis className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {actions}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </span>
  )
}

export { PageCrumb }
