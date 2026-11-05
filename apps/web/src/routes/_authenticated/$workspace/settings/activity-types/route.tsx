import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_authenticated/$workspace/settings/activity-types"
)({
  ssr: false,
  component: Outlet,
})
