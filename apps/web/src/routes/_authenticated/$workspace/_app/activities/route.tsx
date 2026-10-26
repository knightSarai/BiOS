import { createFileRoute, Outlet } from "@tanstack/react-router"
import { CircleDashed } from "lucide-react"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/activities"
)({
  ssr: false,
  staticData: { crumb: { label: "Activities", icon: CircleDashed } },
  component: Outlet,
})
