import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_authenticated/$workspace/settings/fields"
)({
  ssr: false,
  component: Outlet,
})
