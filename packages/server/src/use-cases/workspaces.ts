import {
  findUserByEmail,
  isWorkspaceSlugTaken,
} from "@knight-os/auth/data-access"
import { createWorkspaceForOwner } from "@knight-os/auth/services"
import { ConflictError, NotFoundError } from "#core/errors"
import {
  DEFAULT_WORKSPACE_GENERAL_SETTINGS,
  type WorkspaceGeneralSettings,
} from "#core/schemas"
import { makeRepos } from "#data-access/make-repos"
import type { UserContext } from "./context"

export class WorkspaceSlugTakenError extends ConflictError {
  constructor(slug: string) {
    super(`The address "${slug}" is already taken`)
  }
}

export class WorkspaceOwnerNotFoundError extends NotFoundError {
  constructor(email: string) {
    super(`No user with the email ${email}. They need to sign up first.`)
  }
}

export const createWorkspace = async (
  ctx: UserContext,
  input: {
    name: string
    slug: string
    ownerEmail: string
    general?: Partial<WorkspaceGeneralSettings>
  }
) => {
  const owner = await findUserByEmail(input.ownerEmail)
  if (!owner) throw new WorkspaceOwnerNotFoundError(input.ownerEmail)

  if (await isWorkspaceSlugTaken(input.slug)) {
    throw new WorkspaceSlugTakenError(input.slug)
  }

  const workspace = await createWorkspaceForOwner({
    name: input.name,
    slug: input.slug,
    ownerId: owner.id,
  })

  await makeRepos(ctx.db, ctx).workspaceSettings.saveGeneral(workspace.id, {
    ...DEFAULT_WORKSPACE_GENERAL_SETTINGS,
    ...input.general,
  })

  ctx.logger.info(
    { workspaceId: workspace.id, ownerId: owner.id },
    "Workspace created"
  )

  return { id: workspace.id, slug: workspace.slug }
}
