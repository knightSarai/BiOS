import { listAuthUsers } from "#services/users"
import { listMembershipsForUsers } from "#data-access/members"

export const listUsersWithWorkspaces = async (
  query: Parameters<typeof listAuthUsers>[0],
  headers: Headers
) => {
  const result = await listAuthUsers(query, headers)
  const memberships = await listMembershipsForUsers(
    result.users.map((user) => user.id)
  )

  const workspacesByUser = Map.groupBy(memberships, (m) => m.userId)

  return {
    ...result,
    users: result.users.map((user) => ({
      ...user,
      workspaces: workspacesByUser.get(user.id) ?? [],
    })),
  }
}
