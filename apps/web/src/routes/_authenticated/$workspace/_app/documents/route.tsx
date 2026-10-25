import { createFileRoute, Outlet } from "@tanstack/react-router"
import { FileText } from "lucide-react"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/documents"
)({
  ssr: false,
  staticData: { crumb: { label: "Documents", icon: FileText } },
  component: Outlet,
})
