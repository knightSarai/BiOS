import { z } from "zod"
import { updateWorkspace } from "@knight-os/auth/services"
import {
  preferencesSchema,
  workspaceGeneralSettingsSchema,
} from "#core/schemas"
import { makeRepos } from "#data-access/make-repos"
import { createTRPCRouter } from "#trpc/init"
import {
  protectedProcedure,
  workspacePermissionProcedure,
} from "#trpc/procedures"

const userSettingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) =>
    makeRepos(ctx.db, ctx).userSettings.get()
  ),

  update: protectedProcedure
    .input(preferencesSchema)
    .mutation(async ({ ctx, input }) => {
      await makeRepos(ctx.db, ctx).userSettings.save(input)
    }),
})

const workspaceSettingsRouter = createTRPCRouter({
  get: workspacePermissionProcedure({ workspaceSettings: ["view"] }).query(
    ({ ctx }) => ({ name: ctx.workspace.name, general: ctx.workspace.settings })
  ),

  update: workspacePermissionProcedure({ workspaceSettings: ["update"] })
    .input(
      z.object({
        name: z.string().trim().min(1).max(100),
        general: workspaceGeneralSettingsSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.name !== ctx.workspace.name) {
        await updateWorkspace(ctx.workspace.id, { name: input.name }, ctx.headers)
      }
      await makeRepos(ctx.db, ctx).workspaceSettings.saveGeneral(
        ctx.workspace.id,
        input.general
      )
    }),
})

export const settingsRouter = createTRPCRouter({
  user: userSettingsRouter,
  workspace: workspaceSettingsRouter,
})
