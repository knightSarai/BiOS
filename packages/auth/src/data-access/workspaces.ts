import { and, asc, eq } from "drizzle-orm"
import { db } from "#db"
import { members, organizations, users } from "#db/schema"
import { hasMemberRole } from "#permissions"

export type Workspace = typeof organizations.$inferSelect

export const getWorkspaceBySlug = async (slug: string) => {
  const [workspace] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1)

  return workspace ?? null
}

export const isWorkspaceSlugTaken = async (slug: string) =>
  (await getWorkspaceBySlug(slug)) !== null

export const listUserWorkspaces = async (userId: string) =>
  await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      logo: organizations.logo,
      role: members.role,
    })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, userId))
    .orderBy(asc(organizations.name))

export const getWorkspaceMembership = async (
  userId: string,
  workspaceSlug: string
) => {
  const [row] = await db
    .select({ workspace: organizations, role: members.role })
    .from(organizations)
    .innerJoin(
      members,
      and(
        eq(members.organizationId, organizations.id),
        eq(members.userId, userId)
      )
    )
    .where(eq(organizations.slug, workspaceSlug))
    .limit(1)

  return row ?? null
}

export const listWorkspacesWithOwners = async () => {
  const workspaces = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .orderBy(asc(organizations.name))

  const memberships = await db
    .select({
      workspaceId: members.organizationId,
      role: members.role,
      name: users.name,
      email: users.email,
    })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))

  const membershipsByWorkspace = Map.groupBy(
    memberships,
    (membership) => membership.workspaceId
  )

  return workspaces.map((workspace) => {
    const workspaceMembers = membershipsByWorkspace.get(workspace.id) ?? []
    return {
      ...workspace,
      memberCount: workspaceMembers.length,
      owners: workspaceMembers.filter((member) =>
        hasMemberRole(member.role, "owner")
      ),
    }
  })
}
