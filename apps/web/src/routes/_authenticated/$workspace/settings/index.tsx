import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/$workspace/settings/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$workspace/settings/preferences", params })
  },
})
