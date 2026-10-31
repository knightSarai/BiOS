import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/activities"
)({
  ssr: false,
  component: Outlet,
})
