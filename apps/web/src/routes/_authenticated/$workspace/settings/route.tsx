import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { ChevronLeft, SlidersHorizontal, Settings2 } from "lucide-react"
import type { NavSection } from "@layout/nav-types"
import { AppShell, MobileNavButton } from "@layout/core/AppShell"
import { resolveNav } from "@layout/resolve-nav"

const nav: NavSection[] = [
  {
    label: "Personal",
    links: [
      {
        icon: SlidersHorizontal,
        label: "Preferences",
        route: "/settings/preferences",
      },
    ],
  },
  {
    label: "Workspace",
    links: [
      {
        icon: Settings2,
        label: "General",
        route: "/settings/general",
        permission: { workspaceSettings: ["view"] },
      },
    ],
  },
]

export const Route = createFileRoute("/_authenticated/$workspace/settings")({
  component: SettingsLayout,
})

function SettingsLayout() {
  const { workspace, effective } = Route.useRouteContext()

  return (
    <AppShell
      menu={
        <Link
          to="/$workspace"
          params={{ workspace: workspace.slug }}
          className="mb-1 flex min-h-8 items-center gap-1.5 self-start rounded-md px-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-md:min-h-11"
        >
          <ChevronLeft className="size-4" />
          Back to app
        </Link>
      }
      nav={resolveNav(nav, `/${workspace.slug}`, effective)}
      header={
        <header className="flex min-h-[46px] shrink-0 items-center border-b px-4 md:hidden">
          <MobileNavButton />
        </header>
      }
    >
      <Outlet />
    </AppShell>
  )
}
