import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import {
  Users,
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
  UserCog,
} from "lucide-react"
import { useTRPC } from "@/trpc/react"
import { Page } from "@layout/content/Page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable } from "@/components/tables"
import { formatDate, parseUtc } from "@knight-os/server/core"
import type { AppTableFeatures } from "@/components/tables/table-features"
import { EmptyState } from "@/components/common/EmptyState"

type UserRow = {
  id: string
  name: string
  email: string
  role: string | null
  banned: boolean | null
  createdAt: Date
  workspaces: {
    userId: string
    role: string | null
    workspaceId: string
    workspaceName: string
    workspaceSlug: string
  }[]
}

export default function UsersList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery(
    trpc.admin.users.list.queryOptions({ limit: 50 })
  )

  const invalidateUsers = () =>
    queryClient.invalidateQueries(trpc.admin.users.list.queryFilter())

  const ban = useMutation(
    trpc.admin.users.ban.mutationOptions({ onSuccess: invalidateUsers })
  )

  const unban = useMutation(
    trpc.admin.users.unban.mutationOptions({ onSuccess: invalidateUsers })
  )

  const setRole = useMutation(
    trpc.admin.users.setRole.mutationOptions({ onSuccess: invalidateUsers })
  )

  const columns: ColumnDef<AppTableFeatures, UserRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: (info) => (
        <span className="font-medium">{info.getValue<string>()}</span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <Badge
          variant={row.original.role === "admin" ? "default" : "secondary"}
        >
          {row.original.role ?? "user"}
        </Badge>
      ),
    },
    {
      id: "workspaces",
      header: "Workspaces",
      accessorFn: (row) => row.workspaces.map((w) => w.workspaceName).join(", "),
      cell: ({ row }) => {
        const orgs = row.original.workspaces
        if (!orgs.length) {
          return <span className="text-muted-foreground">—</span>
        }
        return (
          <div className="flex flex-wrap gap-1">
            {orgs.slice(0, 2).map((org) => (
              <Badge key={org.workspaceId} variant="outline" className="text-xs">
                {org.workspaceName}
                <span className="ml-1 text-muted-foreground">({org.role})</span>
              </Badge>
            ))}
            {orgs.length > 2 ? (
              <Badge variant="secondary" className="text-xs">
                +{orgs.length - 2} more
              </Badge>
            ) : null}
          </div>
        )
      },
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => (row.banned ? "Banned" : "Active"),
      cell: ({ row }) =>
        row.original.banned ? (
          <Badge variant="destructive">Banned</Badge>
        ) : (
          <Badge variant="outline">Active</Badge>
        ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: (info) => (
        <span className="text-muted-foreground">
          {formatDate(parseUtc(info.getValue<string>()), "UTC")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      enableGlobalFilter: false,
      size: 48,
      cell: ({ row }) => {
        const user = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Actions for ${user.name}`}
                  className="size-8"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {user.role === "admin" ? (
                <DropdownMenuItem
                  onClick={() =>
                    setRole.mutate({ userId: user.id, role: "user" })
                  }
                >
                  <ShieldOff className="size-4" />
                  Remove Admin
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() =>
                    setRole.mutate({ userId: user.id, role: "admin" })
                  }
                >
                  <ShieldCheck className="size-4" />
                  Make Admin
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              {user.banned ? (
                <DropdownMenuItem
                  onClick={() => unban.mutate({ userId: user.id })}
                >
                  <UserCog className="size-4" />
                  Unban User
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => ban.mutate({ userId: user.id })}
                >
                  <UserCog className="size-4" />
                  Ban User
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  const users = (data?.users ?? []) as UserRow[]

  const isEmpty = !isLoading && !users.length

  return (
    <Page.Layout>
      <Page.Header>
        <Page.HeaderContent>
          <Page.Title>Users</Page.Title>
        </Page.HeaderContent>
        {!isError && !isLoading ? (
          <Page.HeaderActions>
            <p className="text-sm text-muted-foreground">
              {data?.total ?? 0} total
            </p>
          </Page.HeaderActions>
        ) : null}
      </Page.Header>
      <Page.Body>
        <Page.ScrollArea>
          {isError ? (
            <p className="p-6 text-sm text-destructive">
              Failed to load users. Please refresh the page.
            </p>
          ) : isEmpty ? (
            <Page.Content>
              <EmptyState.Root>
                <EmptyState.Icon icon={Users} />
                <EmptyState.Text>
                  <EmptyState.Title>No users yet</EmptyState.Title>
                  <EmptyState.Description>
                    Users appear here once they sign up.
                  </EmptyState.Description>
                </EmptyState.Text>
              </EmptyState.Root>
            </Page.Content>
          ) : (
            <DataTable
              columns={columns}
              data={users}
              isLoading={isLoading}
              initialColumnPinning={{ start: [], end: ["actions"] }}
            />
          )}
        </Page.ScrollArea>
      </Page.Body>
    </Page.Layout>
  )
}
