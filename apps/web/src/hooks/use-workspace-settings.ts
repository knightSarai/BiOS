import { getRouteApi } from "@tanstack/react-router"

const workspaceRoute = getRouteApi("/_authenticated/$workspace")

export function useWorkspaceSettings() {
  return workspaceRoute.useRouteContext().workspace.settings
}
