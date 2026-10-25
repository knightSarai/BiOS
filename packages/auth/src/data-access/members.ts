import { eq, inArray } from "drizzle-orm"
import { db } from "#db"
import { members, organizations } from "#db/schema"

export const listMembershipsForUsers = async (userIds: string[]) => {
  if (!userIds.length) return []
  return await db
    .select({
      userId: members.userId,
      role: members.role,
      workspaceId: organizations.id,
      workspaceName: organizations.name,
      workspaceSlug: organizations.slug,
    })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(inArray(members.userId, userIds))
}
