import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
} from "@tanstack/react-router"
import { NotFound } from "@/components/common/NotFound"
import { isTRPCClientError } from "@/lib/errors"

export const Route = createFileRoute("/_authenticated/$workspace")({
  beforeLoad: async ({ context, params }) => {
    try {
      const [current] = await Promise.all([
        context.queryClient.ensureQueryData(
          context.trpc.workspaces.get.queryOptions({
            workspace: params.workspace,
          })
        ),
        context.queryClient.ensureQueryData(
          context.trpc.workspaces.list.queryOptions()
        ),
      ])

      return {
        workspace: current.workspace,
        memberRole: current.memberRole,
        effective: current.effective,
      }
    } catch (error) {
      if (isTRPCClientError(error) && error.data?.code === "NOT_FOUND") {
        throw notFound()
      }
      throw error
    }
  },
  component: Outlet,
  notFoundComponent: WorkspaceNotFound,
})

function WorkspaceNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <NotFound className="max-w-sm">
        <NotFound.Title>Workspace not found</NotFound.Title>
        <NotFound.Description>
          This workspace does not exist, or you are not a member of it.
        </NotFound.Description>
        <NotFound.Actions>
          <Link
            to="/"
            className="text-sm font-medium text-primary hover:underline"
          >
            Go to your workspaces
          </Link>
        </NotFound.Actions>
      </NotFound>
    </div>
  )
}
