import type { AppDBOrTx } from "#db"
import type { RepositoryContext } from "./context"
import { UserSettingsRepository } from "./user-settings"
import { WorkspaceSettingsRepository } from "./workspace-settings"

export const makeRepos = (db: AppDBOrTx, ctx: RepositoryContext) => ({
  userSettings: new UserSettingsRepository(db, ctx),
  workspaceSettings: new WorkspaceSettingsRepository(db, ctx),
})
