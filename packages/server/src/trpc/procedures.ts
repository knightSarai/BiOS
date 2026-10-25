import { z } from "zod"
import { getWorkspaceMembership } from "@knight-os/auth/data-access"
import {
  isAllowed,
  resolveEffectivePermissions,
  type AppPermission,
} from "@knight-os/auth/permissions"
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "#core/errors"
import { DEFAULT_WORKSPACE_GENERAL_SETTINGS } from "#core/schemas"
import { db } from "#db"
import { makeRepos } from "#data-access/make-repos"
import { baseProcedure, middleware } from "./init"

const isAuthed = middleware(async ({ ctx, next }) => {
  const { user, session } = ctx
  if (!user || !session) {
    throw new UnauthorizedError("You must be signed in")
  }

  return next({ ctx: { ...ctx, user, session, db } })
})

export const protectedProcedure = baseProcedure.use(isAuthed)

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new ForbiddenError("Admin access required")
  }

  return next({ ctx })
})

export class WorkspaceNotFoundError extends NotFoundError {
  constructor() {
    super("Workspace not found")
  }
}

export const workspaceInputSchema = z.object({
  workspace: z.string().trim().min(1),
})

export const workspaceProcedure = protectedProcedure
  .input(workspaceInputSchema)
  .use(async ({ ctx, input, next }) => {
    const membership = await getWorkspaceMembership(
      ctx.user.id,
      input.workspace
    )
    if (!membership) throw new WorkspaceNotFoundError()

    const settings = await makeRepos(ctx.db, ctx).workspaceSettings.byWorkspaceId(
      membership.workspace.id
    )

    return next({
      ctx: {
        ...ctx,
        workspace: {
          id: membership.workspace.id,
          name: membership.workspace.name,
          slug: membership.workspace.slug,
          settings: settings?.general ?? DEFAULT_WORKSPACE_GENERAL_SETTINGS,
        },
        memberRole: membership.role,
        effective: resolveEffectivePermissions(membership.role),
      },
    })
  })

export const workspacePermissionProcedure = (permission: AppPermission) =>
  workspaceProcedure.use(async ({ ctx, next }) => {
    if (!isAllowed(permission, ctx.effective)) {
      throw new ForbiddenError("Missing workspace permission")
    }

    return next({ ctx })
  })
