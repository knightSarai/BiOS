import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_authenticated/$workspace/_app/documents/"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$workspace/notebook",
      params: { workspace: params.workspace },
    })
  },
})
