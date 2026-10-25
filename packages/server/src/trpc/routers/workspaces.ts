import { listUserWorkspaces } from "@knight-os/auth/data-access"
import { createTRPCRouter } from "#trpc/init"
import { protectedProcedure, workspaceProcedure } from "#trpc/procedures"

export const workspacesRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) =>
    listUserWorkspaces(ctx.user.id)
  ),

  get: workspaceProcedure.query(({ ctx }) => ({
    workspace: ctx.workspace,
    memberRole: ctx.memberRole,
    effective: ctx.effective,
  })),
})
