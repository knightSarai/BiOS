import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useSetAtom } from "jotai"
import { Plus } from "lucide-react"
import { areaDotClassNames } from "@/activities/areas"
import { areasQuery } from "@/local-db/activity-queries"
import { cn } from "@/lib/utils"
import { navRowClassName } from "@layout/core/AppShell"
import { newAreaDialogOpenAtom } from "./atoms"

type AreasNavProps = {
  workspace: { id: string; name: string; slug: string }
  onNavigate?: () => void
}

function AreasNav({ workspace, onNavigate }: AreasNavProps) {
  const { data: areas } = useQuery(areasQuery(workspace))
  const setNewAreaOpen = useSetAtom(newAreaDialogOpenAtom)

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between pt-[18px] pr-1 pb-1.5 pl-2">
        <span className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
          Areas
        </span>
        <button
          type="button"
          aria-label="New area"
          onClick={() => setNewAreaOpen(true)}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground max-md:size-11"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {areas?.map((area) => (
        <Link
          key={area.id}
          to="/$workspace/activities"
          params={{ workspace: workspace.slug }}
          search={{ area: area.id }}
          activeOptions={{ includeSearch: true }}
          onClick={onNavigate}
          className={navRowClassName}
        >
          <span
            className={cn(
              "mx-1 size-2 shrink-0 rounded-full",
              areaDotClassNames[area.color]
            )}
          />
          <span className="flex-1 truncate">{area.name}</span>
          {area.openCount > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {area.openCount}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  )
}

export { AreasNav }
