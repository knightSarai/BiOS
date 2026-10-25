import { createTRPCRouter } from "./init"
import { adminRouter } from "./routers/admin"
import { settingsRouter } from "./routers/settings"
import { workspacesRouter } from "./routers/workspaces"

export const appRouter = createTRPCRouter({
  admin: adminRouter,
  settings: settingsRouter,
  workspaces: workspacesRouter,
})

export type AppRouter = typeof appRouter
