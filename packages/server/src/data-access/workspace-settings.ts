import { eq } from "drizzle-orm"
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
  type AppDBOrTx,
} from "#db"
import { workspaceSettings } from "#db/schema"
import type { WorkspaceGeneralSettings } from "#core/schemas"
import type { RepositoryContext } from "./context"

export class WorkspaceSettingsRepository {
  constructor(
    private readonly db: AppDBOrTx,
    private readonly ctx: RepositoryContext
  ) {}

  async byWorkspaceId(workspaceId: string) {
    const [row] = await this.db
      .select({ general: workspaceSettings.general })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
    return row ?? null
  }

  async saveGeneral(workspaceId: string, general: WorkspaceGeneralSettings) {
    await this.db
      .insert(workspaceSettings)
      .values({
        workspaceId,
        general,
        ...auditFieldsForCreate(this.ctx.user),
      })
      .onConflictDoUpdate({
        target: workspaceSettings.workspaceId,
        set: { general, ...auditFieldsForUpdate(this.ctx.user) },
      })
  }
}
