import { z } from "zod"
import {
  isWorkspaceSlugTaken,
  listWorkspacesWithOwners,
} from "@knight-os/auth/data-access"
import { banUser, setUserRole, unbanUser } from "@knight-os/auth/services"
import { listUsersWithWorkspaces } from "@knight-os/auth/use-cases"
import { isValidWorkspaceSlug, toSlug } from "@knight-os/auth/utils"
import { createWorkspaceSchema } from "@knight-os/auth/validation"
import { timezoneSchema } from "#core/schemas"
import { createWorkspace } from "#use-cases/workspaces"
import { createTRPCRouter } from "#trpc/init"
import { adminProcedure } from "#trpc/procedures"

const usersRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(20),
        offset: z.number().min(0).optional().default(0),
        search: z.string().trim().optional(),
      })
    )
    .query(async ({ input, ctx }) =>
      listUsersWithWorkspaces(
        {
          limit: input.limit,
          offset: input.offset,
          ...(input.search
            ? {
                searchValue: input.search,
                searchField: "email",
                searchOperator: "contains",
              }
            : {}),
          sortBy: "createdAt",
          sortDirection: "desc",
        },
        ctx.headers
      )
    ),

  ban: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => banUser(input.userId, ctx.headers)),

  unban: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => unbanUser(input.userId, ctx.headers)),

  setRole: adminProcedure
    .input(
      z.object({ userId: z.string().min(1), role: z.enum(["admin", "user"]) })
    )
    .mutation(async ({ input, ctx }) =>
      setUserRole(input.userId, input.role, ctx.headers)
    ),
})

const workspacesRouter = createTRPCRouter({
  list: adminProcedure.query(async () => listWorkspacesWithOwners()),

  checkSlug: adminProcedure
    .input(z.object({ slug: z.string().trim() }))
    .query(async ({ input }) => {
      const slug = toSlug(input.slug)
      const available =
        isValidWorkspaceSlug(slug) && !(await isWorkspaceSlugTaken(slug))
      return { slug, available }
    }),

  create: adminProcedure
    .input(createWorkspaceSchema.extend({ timezone: timezoneSchema }))
    .mutation(async ({ ctx, input }) =>
      createWorkspace(ctx, {
        name: input.name,
        slug: input.slug,
        ownerEmail: input.ownerEmail.toLowerCase(),
        general: { timezone: input.timezone },
      })
    ),
})

export const adminRouter = createTRPCRouter({
  users: usersRouter,
  workspaces: workspacesRouter,
})
