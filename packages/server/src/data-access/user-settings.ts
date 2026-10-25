import { eq } from "drizzle-orm"
import type { AppDBOrTx } from "#db"
import { userSettings } from "#db/schema"
import type { Preferences } from "#core/schemas"
import type { RepositoryContext } from "./context"

export class UserSettingsRepository {
  constructor(
    private readonly db: AppDBOrTx,
    private readonly ctx: RepositoryContext
  ) {}

  async get() {
    const [row] = await this.db
      .select({ preferences: userSettings.preferences })
      .from(userSettings)
      .where(eq(userSettings.userId, this.ctx.user.id))
    return row?.preferences ?? null
  }

  async save(preferences: Preferences) {
    await this.db
      .insert(userSettings)
      .values({ userId: this.ctx.user.id, preferences })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { preferences },
      })
  }
}
