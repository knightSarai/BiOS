import { createFileRoute, Outlet } from "@tanstack/react-router"
import { AppShell } from "@layout/core/AppShell"
import { resolveNav } from "@layout/resolve-nav"
import { AreasNav } from "../-nav/AreasNav"
import { NewAreaDialog } from "../-nav/NewAreaDialog"
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
      sections={(onNavigate) => (
        <AreasNav workspace={workspace} onNavigate={onNavigate} />
      )}
    >
      <Outlet />
      <NewAreaDialog workspaceId={workspace.id} />
    </AppShell>
  )
}
