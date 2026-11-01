import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/$workspace/_app/goals")({
  ssr: false,
  component: Outlet,
})
