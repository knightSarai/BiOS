import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Boxes, Plus } from "lucide-react"
import {
  DEFAULT_WORKSPACE_GENERAL_SETTINGS,
  formatWorkspaceDate,
} from "@knight-os/server/core"
import { EmptyState } from "@/components/common/EmptyState"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useTRPC } from "@/trpc/react"
import { Page } from "@layout/content/Page"

export const Route = createFileRoute("/_authenticated/admin/workspaces/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      context.trpc.admin.workspaces.list.queryOptions()
    ),
  component: WorkspacesPage,
})

function WorkspacesPage() {
  const trpc = useTRPC()
  const { data: workspaces } = useSuspenseQuery(
    trpc.admin.workspaces.list.queryOptions()
  )

  return (
    <Page.Layout>
      <Page.Header>
        <Page.HeaderContent>
          <Page.Title>Workspaces</Page.Title>
        </Page.HeaderContent>
        <Page.HeaderActions>
          <Link
            to="/admin/workspaces/new"
            className={buttonVariants({ size: "lg" })}
          >
            <Plus />
            Create workspace
          </Link>
        </Page.HeaderActions>
      </Page.Header>
      <Page.Body>
        <Page.ScrollArea>
          <Page.Content>
            {workspaces.length ? (
              <div className="overflow-hidden rounded-lg border">
                <Table className="text-[13px] [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:text-muted-foreground [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Members</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workspaces.map((workspace) => (
                      <TableRow key={workspace.id}>
                        <TableCell className="font-medium">
                          {workspace.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          /{workspace.slug}
                        </TableCell>
                        <TableCell>
                          {workspace.owners
                            .map((owner) => `${owner.name} (${owner.email})`)
                            .join(", ") || "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {workspace.memberCount}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatWorkspaceDate(
                            workspace.createdAt,
                            DEFAULT_WORKSPACE_GENERAL_SETTINGS
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState.Root>
                <EmptyState.Icon icon={Boxes} />
                <EmptyState.Text>
                  <EmptyState.Title>No workspaces yet</EmptyState.Title>
                  <EmptyState.Description>
                    Create a workspace and choose who owns it.
                  </EmptyState.Description>
                </EmptyState.Text>
              </EmptyState.Root>
            )}
          </Page.Content>
        </Page.ScrollArea>
      </Page.Body>
    </Page.Layout>
  )
}
