import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/admin/workspaces")({
  staticData: { crumb: { label: "Workspaces" } },
  component: Outlet,
})
