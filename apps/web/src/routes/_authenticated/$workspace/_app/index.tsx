import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/$workspace/_app/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$workspace/today", params })
  },
})
