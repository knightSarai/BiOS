import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    if (!context.auth) {
      throw redirect({ to: "/sign-in" })
    }

    const workspaces = await context.queryClient.ensureQueryData(
      context.trpc.workspaces.list.queryOptions()
    )

    const [first] = workspaces
    if (!first) {
      throw redirect({
        to: context.auth.user.role === "admin" ? "/admin/workspaces" : "/no-workspace",
      })
    }

    throw redirect({ to: "/$workspace", params: { workspace: first.slug } })
  },
})
