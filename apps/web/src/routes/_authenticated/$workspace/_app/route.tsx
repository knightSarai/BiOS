import { createFileRoute, Outlet } from "@tanstack/react-router"
import { AppShell } from "@layout/core/AppShell"
import { resolveNav } from "@layout/resolve-nav"
import { nav } from "../-nav/data"
import { WorkspaceMenu } from "../-nav/WorkspaceMenu"

export const Route = createFileRoute("/_authenticated/$workspace/_app")({
  component: RouteComponent,
})

function RouteComponent() {
  const { workspace, effective } = Route.useRouteContext()

  return (
    <AppShell
      menu={<WorkspaceMenu />}
      nav={resolveNav(nav, `/${workspace.slug}`, effective)}
    >
      <Outlet />
    </AppShell>
  )
}
