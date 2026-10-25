import { auth } from "#auth"

export const createWorkspaceForOwner = async (input: {
  name: string
  slug: string
  ownerId: string
}) =>
  await auth.api.createOrganization({
    body: { name: input.name, slug: input.slug, userId: input.ownerId },
  })

export const updateWorkspace = async (
  workspaceId: string,
  data: { name?: string; slug?: string },
  headers: Headers
) =>
  await auth.api.updateOrganization({
    body: { organizationId: workspaceId, data },
    headers,
  })
