import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/documents"
)({
  ssr: false,
  component: Outlet,
})
