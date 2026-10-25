import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { now } from "#core/datetime"
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type WorkspaceGeneralSettings,
} from "#core/schemas"

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => now()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => now())
    .$onUpdate(() => now()),
}

const auditFields = {
  createdById: text("created_by_id").notNull(),
  createdByName: text("created_by_name").notNull(),
  updatedById: text("updated_by_id").notNull(),
  updatedByName: text("updated_by_name").notNull(),
}

export const commonFields = {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: text("workspace_id").notNull(),
  ...timestamps,
  ...auditFields,
}

export const workspaceSettings = sqliteTable(
  "workspace_settings",
  {
    ...commonFields,
    general: text("general", { mode: "json" })
      .$type<WorkspaceGeneralSettings>()
      .notNull(),
  },
  (t) => [uniqueIndex("workspace_settings_workspace_uidx").on(t.workspaceId)]
)

export const userSettings = sqliteTable("user_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().unique(),
  preferences: text("preferences", { mode: "json" })
    .$type<Preferences>()
    .notNull()
    .$defaultFn(() => DEFAULT_PREFERENCES),
  ...timestamps,
})
