import { ClientOnly, createFileRoute, Outlet } from "@tanstack/react-router"
import { AppShell } from "@layout/core/AppShell"
import { NewActivityDialog } from "@/activities/components/NewActivityDialog"
import { RoutineChrome } from "@/activities/components/RoutineChrome"
import { resolveNav } from "@layout/resolve-nav"
import { NotebookDialogs } from "@/notebook/components/NotebookDialogs"
import { NotebookNav } from "@/notebook/components/NotebookNav"
import { AreasNav } from "../-nav/AreasNav"
import { NewAreaDialog } from "../-nav/NewAreaDialog"
import { nav } from "../-nav/data"
import { WorkspaceMenu } from "../-nav/WorkspaceMenu"

// `full` opens the running routine full screen over whichever page you're on, so leaving it
// (or pressing Back) returns to that page.
type AppSearch = { full?: true }

export const Route = createFileRoute("/_authenticated/$workspace/_app")({
  validateSearch: (search: Record<string, unknown>): AppSearch =>
    search.full === true || search.full === "true" ? { full: true } : {},
  component: RouteComponent,
})

function RouteComponent() {
  const { workspace, effective } = Route.useRouteContext()
  const notebookWorkspace = { id: workspace.id, slug: workspace.slug }

  return (
    <AppShell
      menu={<WorkspaceMenu />}
      nav={resolveNav(nav, `/${workspace.slug}`, effective)}
      sections={(onNavigate) => (
        <>
          <AreasNav workspace={workspace} onNavigate={onNavigate} />
          <NotebookNav workspace={notebookWorkspace} onNavigate={onNavigate} />
        </>
      )}
    >
      <div className="absolute inset-0 flex flex-col">
        <div className="relative min-h-0 flex-1">
          <Outlet />
        </div>
        <ClientOnly>
          <RoutineChrome
            workspace={{
              id: workspace.id,
              timezone: workspace.settings.timezone,
            }}
          />
        </ClientOnly>
      </div>
      <NewAreaDialog workspaceId={workspace.id} />
      <NewActivityDialog
        workspace={{
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          timezone: workspace.settings.timezone,
        }}
      />
      <NotebookDialogs workspace={notebookWorkspace} />
    </AppShell>
  )
}
